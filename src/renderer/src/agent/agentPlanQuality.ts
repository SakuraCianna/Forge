// 本文件说明: 在模型计划进入执行队列前做轻量预检, 修正常见的脚手架任务误判
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import {
  formatScaffoldLayerLabels,
  supplementBareProjectScaffoldActions,
  type ScaffoldLayer
} from "@/agent/agentScaffoldPlanQuality";

type AgentPlanQualityInput = {
  actions: AgentAction[];
  language: Language;
  projectScan?: ProjectScanResult | null;
  prompt: string;
};

type AgentPlanQualityResult = {
  actions: AgentAction[];
  notices: string[];
};

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type PackageVerificationCommand = {
  installCommand: string;
  packageRoot: string;
  manager: PackageManager;
};

const CREATE_TASK_PATTERN =
  /(创建|新建|生成|搭建|实现|做一个|写一个|开发|create|generate|scaffold|build|make|implement)/iu;
const PROJECT_SCOPE_PATTERN =
  /(项目|工程|系统|应用|页面|接口|数据库|前端|后端|前后端|project|app|application|system|frontend|backend|spring|vue|react|vite|api)/iu;

const FOUNDATION_FILE_NAMES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradlew",
  "pyproject.toml",
  "requirements.txt",
  "cargo.toml",
  "go.mod",
  "composer.json",
  "gemfile",
  "makefile",
  "vite.config.js",
  "vite.config.ts",
  "tsconfig.json"
]);

const COMMON_SCAFFOLD_TARGET_PATTERN =
  /(?:^|\/)(?:pom\.xml|package\.json|vite\.config\.[jt]s|tsconfig\.json|index\.html|application\.(?:ya?ml|properties)|main\.[jt]sx?|app\.(?:[jt]sx?|vue)|[^/]+application\.java|[^/]+controller\.java|[^/]+repository\.java|[^/]+service\.java|[^/]+entity\/[^/]+\.java|readme\.md)$/iu;

// 计划质量层只改动作类型和目标, 不生成文件内容; 真实内容仍走受控 edit 通道和 diff 审查。
export function improveAgentPlanActions({
  actions,
  language,
  projectScan,
  prompt
}: AgentPlanQualityInput): AgentPlanQualityResult {
  const isCreationTask = hasProjectCreationIntent(prompt);
  const bareProject = isBareProject(projectScan);
  const knownFilePaths = new Set(
    (projectScan?.files ?? []).map((file) => normalizeProjectPath(file.relativePath))
  );
  let inspectConversions = 0;
  let shellWriterConversions = 0;
  const improvedActions: AgentAction[] = [];

  for (const action of actions) {
    if (shouldConvertInspectToCreate(action, isCreationTask, bareProject, knownFilePaths)) {
      improvedActions.push(createEditAction(action, action.target!, "create"));
      inspectConversions += 1;
      continue;
    }

    const shellWriterTargets = isCreationTask
      ? extractShellWriterTargets(action, projectScan?.rootPath ?? null)
      : [];

    if (shellWriterTargets.length > 0) {
      shellWriterTargets.forEach((target) => {
        improvedActions.push(createEditAction(action, target, "create"));
      });
      shellWriterConversions += shellWriterTargets.length;
      continue;
    }

    improvedActions.push(action);
  }

  const scaffoldResult = supplementBareProjectScaffoldActions({
    actions: improvedActions,
    bareProject,
    isCreationTask,
    prompt
  });
  const dependencySetupResult = insertMissingPackageInstallActions({
    actions: scaffoldResult.actions,
    isCreationTask,
    projectScan
  });

  const notices = formatPlanQualityNotices({
    language,
    inspectConversions,
    shellWriterConversions,
    dependencyInstallSupplements: dependencySetupResult.addedActions,
    scaffoldSupplements: scaffoldResult.addedActions,
    missingScaffoldLayers: scaffoldResult.missingLayers
  });

  return {
    actions: renumberActions(dependencySetupResult.actions),
    notices
  };
}

function shouldConvertInspectToCreate(
  action: AgentAction,
  isCreationTask: boolean,
  bareProject: boolean,
  knownFilePaths: Set<string>
): boolean {
  if (!isCreationTask || action.kind !== "inspect-file" || !action.target) {
    return false;
  }

  const normalizedTarget = normalizeProjectPath(action.target);

  if (knownFilePaths.has(normalizedTarget)) {
    return false;
  }

  return bareProject || COMMON_SCAFFOLD_TARGET_PATTERN.test(normalizedTarget);
}

function createEditAction(
  sourceAction: AgentAction,
  target: string,
  mode: "create" | "edit"
): AgentAction {
  return {
    id: sourceAction.id,
    stepId: sourceAction.stepId,
    kind: "edit-file",
    label: `${mode === "create" ? "创建" : "编辑"} ${target}`,
    status: "pending",
    target
  };
}

function insertMissingPackageInstallActions({
  actions,
  isCreationTask,
  projectScan
}: {
  actions: AgentAction[];
  isCreationTask: boolean;
  projectScan?: ProjectScanResult | null;
}): { actions: AgentAction[]; addedActions: number } {
  if (!isCreationTask) {
    return { actions, addedActions: 0 };
  }

  const packageRoots = collectKnownPackageRoots(actions, projectScan);
  const installedRoots = new Set<string>();
  const nextActions: AgentAction[] = [];
  let addedActions = 0;

  for (const action of actions) {
    const installRoot = action.command ? parsePackageInstallCommandRoot(action.command) : null;

    if (installRoot) {
      installedRoots.add(installRoot);
      nextActions.push(action);
      continue;
    }

    const verification = action.command ? parsePackageVerificationCommand(action.command) : null;

    if (
      verification &&
      packageRoots.has(verification.packageRoot) &&
      !installedRoots.has(verification.packageRoot)
    ) {
      nextActions.push(createPackageInstallAction(verification, addedActions));
      installedRoots.add(verification.packageRoot);
      addedActions += 1;
    }

    nextActions.push(action);
  }

  return {
    actions: nextActions,
    addedActions
  };
}

function collectKnownPackageRoots(
  actions: AgentAction[],
  projectScan?: ProjectScanResult | null
): Set<string> {
  const roots = new Set<string>();

  for (const filePath of [
    ...actions.map((action) => action.target ?? ""),
    ...(projectScan?.files ?? []).map((file) => file.relativePath)
  ]) {
    const packageRoot = getPackageRootFromManifestPath(filePath);

    if (packageRoot) {
      roots.add(packageRoot);
    }
  }

  return roots;
}

function getPackageRootFromManifestPath(filePath: string): string | null {
  const normalizedPath = normalizeProjectPath(filePath);

  if (normalizedPath === "package.json") {
    return ".";
  }

  if (!normalizedPath.endsWith("/package.json")) {
    return null;
  }

  return normalizedPath.slice(0, -"/package.json".length) || ".";
}

function parsePackageVerificationCommand(command: string): PackageVerificationCommand | null {
  const normalizedCommand = normalizeCommand(command);
  const packageCommand = parsePackageCommand(normalizedCommand);

  if (!packageCommand || !isPackageVerificationSubcommand(packageCommand.manager, packageCommand.subcommand)) {
    return null;
  }

  return {
    packageRoot: packageCommand.packageRoot,
    manager: packageCommand.manager,
    installCommand: createPackageInstallCommand(packageCommand.manager, packageCommand.packageRoot)
  };
}

function parsePackageInstallCommandRoot(command: string): string | null {
  const normalizedCommand = normalizeCommand(command);
  const packageCommand = parsePackageCommand(normalizedCommand);

  if (packageCommand && isPackageInstallSubcommand(packageCommand.subcommand)) {
    return packageCommand.packageRoot;
  }

  return null;
}

function parsePackageCommand(command: string): {
  manager: PackageManager;
  packageRoot: string;
  subcommand: string;
} | null {
  const managerMatch = command.match(/^(npm|pnpm|yarn|bun)\b/iu);
  const manager = managerMatch?.[1]?.toLocaleLowerCase() as PackageManager | undefined;

  if (!manager) {
    return null;
  }

  const withoutManager = command.slice(managerMatch![0].length).trim();
  const prefixPattern = createPackageRootOptionPattern(manager);
  const prefixMatch = withoutManager.match(prefixPattern);
  const packageRoot = prefixMatch ? normalizePackageRoot(readFirstMatchedGroup(prefixMatch)) : ".";
  const commandTail = prefixMatch
    ? withoutManager.slice(prefixMatch[0].length).trim()
    : withoutManager;
  const subcommand = commandTail.toLocaleLowerCase();

  if (!subcommand) {
    return null;
  }

  return {
    manager,
    packageRoot,
    subcommand
  };
}

function createPackageRootOptionPattern(manager: PackageManager): RegExp {
  const optionNames = {
    npm: ["--prefix", "-c"],
    pnpm: ["--dir", "--cwd", "-c"],
    yarn: ["--cwd", "-c"],
    bun: ["--cwd", "-c"]
  }[manager];
  const optionPattern = optionNames.map(escapeRegExp).join("|");
  const valuePattern = `"([^"]+)"|'([^']+)'|(\\S+)`;

  return new RegExp(`^(?:${optionPattern})(?:=|\\s+)${valuePattern}\\s+`, "iu");
}

function isPackageVerificationSubcommand(
  manager: PackageManager,
  subcommand: string
): boolean {
  if (manager === "npm") {
    return /^(?:test|t|(?:run|run-script)\s+(?:build|test|lint|typecheck))\b/iu.test(subcommand);
  }

  if (manager === "pnpm" || manager === "bun") {
    return /^(?:test|run\s+(?:build|test|lint|typecheck))\b/iu.test(subcommand);
  }

  return /^(?:test|(?:run\s+)?(?:build|test|lint|typecheck))\b/iu.test(subcommand);
}

function isPackageInstallSubcommand(subcommand: string): boolean {
  return /^(?:i|install|ci)\b/iu.test(subcommand);
}

function createPackageInstallCommand(manager: PackageManager, packageRoot: string): string {
  if (packageRoot === ".") {
    return `${manager} install`;
  }

  const packageRootArgument = formatPackageRootArgument(packageRoot);

  if (manager === "npm") {
    return `npm --prefix ${packageRootArgument} install`;
  }

  if (manager === "pnpm") {
    return `pnpm --dir ${packageRootArgument} install`;
  }

  return `${manager} --cwd ${packageRootArgument} install`;
}

function formatPackageRootArgument(packageRoot: string): string {
  return /\s/u.test(packageRoot) ? `"${packageRoot.replace(/"/gu, '\\"')}"` : packageRoot;
}

function createPackageInstallAction(
  verification: PackageVerificationCommand,
  index: number
): AgentAction {
  return {
    id: `plan-quality-package-install-${index + 1}`,
    stepId: "plan-quality-package-install",
    kind: "run-command",
    label: `运行命令 ${verification.installCommand}`,
    status: "pending",
    command: verification.installCommand
  };
}

function renumberActions(actions: AgentAction[]): AgentAction[] {
  return actions.map((action, index) => ({
    ...action,
    id: `action-${index + 1}`
  }));
}

function formatPlanQualityNotices({
  language,
  inspectConversions,
  shellWriterConversions,
  dependencyInstallSupplements,
  scaffoldSupplements,
  missingScaffoldLayers
}: {
  language: Language;
  inspectConversions: number;
  shellWriterConversions: number;
  dependencyInstallSupplements: number;
  scaffoldSupplements: number;
  missingScaffoldLayers: ScaffoldLayer[];
}): string[] {
  const notices: string[] = [];

  if (inspectConversions > 0) {
    notices.push(
      language === "zh-CN"
        ? `计划预检已将 ${inspectConversions} 个不存在脚手架文件的读取步骤改为创建步骤。`
        : `Plan preflight converted ${inspectConversions} scaffold-file read step(s) into create steps.`
    );
  }

  if (shellWriterConversions > 0) {
    notices.push(
      language === "zh-CN"
        ? `计划预检已将 shell 写文件脚本拆成 ${shellWriterConversions} 个受控文件编辑步骤。`
        : `Plan preflight converted shell file-writer commands into ${shellWriterConversions} controlled edit step(s).`
    );
  }

  if (scaffoldSupplements > 0) {
    notices.push(
      language === "zh-CN"
        ? `计划预检已补充 ${scaffoldSupplements} 个空项目工程骨架步骤, 覆盖缺失的 ${formatScaffoldLayerLabels(missingScaffoldLayers, language)}。`
        : `Plan preflight added ${scaffoldSupplements} bare-project scaffold step(s), covering missing ${formatScaffoldLayerLabels(missingScaffoldLayers, language)}.`
    );
  }

  if (dependencyInstallSupplements > 0) {
    notices.push(
      language === "zh-CN"
        ? `计划预检已在前端构建前补充 ${dependencyInstallSupplements} 个依赖安装步骤。`
        : `Plan preflight added ${dependencyInstallSupplements} dependency install step(s) before frontend build commands.`
    );
  }

  return notices;
}

function hasProjectCreationIntent(prompt: string): boolean {
  const normalizedPrompt = prompt.trim();

  return CREATE_TASK_PATTERN.test(normalizedPrompt) && PROJECT_SCOPE_PATTERN.test(normalizedPrompt);
}

function isBareProject(projectScan?: ProjectScanResult | null): boolean {
  const files = projectScan?.files ?? [];

  if (files.length === 0) {
    return true;
  }

  const hasFoundationFile = files.some((file) => isFoundationFile(file.relativePath));

  return !hasFoundationFile && files.length <= 8;
}

function isFoundationFile(relativePath: string): boolean {
  const normalizedPath = normalizeProjectPath(relativePath);
  const fileName = normalizedPath.split("/").at(-1) ?? normalizedPath;

  return (
    FOUNDATION_FILE_NAMES.has(fileName.toLocaleLowerCase()) ||
    /(?:^|\/)src\/main\/java\//iu.test(normalizedPath) ||
    /(?:^|\/)src\/main\.[jt]sx?$/iu.test(normalizedPath) ||
    /(?:^|\/)src\/app\//iu.test(normalizedPath)
  );
}

function extractShellWriterTargets(action: AgentAction, projectRoot: string | null): string[] {
  if (action.kind !== "run-command" || !action.command || !isShellFileWriterCommand(action.command)) {
    return [];
  }

  const rootVariables = extractRootVariableNames(action.command, projectRoot);
  const targets = action.command
    .split(/\r?\n/u)
    .flatMap((line) => extractShellWriterTargetsFromLine(line, projectRoot, rootVariables))
    .map(normalizeProjectPath)
    .filter(isSafeRelativeProjectPath);

  return uniqueStrings(targets);
}

function isShellFileWriterCommand(command: string): boolean {
  return /\b(?:set-content|out-file|add-content|new-item)\b/iu.test(command) || /(?:^|\s)>>?\s*\S/iu.test(command);
}

function extractRootVariableNames(command: string, projectRoot: string | null): Set<string> {
  const names = new Set(["root", "projectroot", "workspaceroot"]);
  const assignmentPattern = /^\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"])(.*?)\2\s*$/gmu;
  let match: RegExpExecArray | null;

  while ((match = assignmentPattern.exec(command)) !== null) {
    const [, name, , value] = match;

    if (name && isLikelyProjectRootValue(value, projectRoot)) {
      names.add(name.toLocaleLowerCase());
    }
  }

  return names;
}

function isLikelyProjectRootValue(value: string | undefined, projectRoot: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue = normalizeProjectPath(value);

  return (
    /^[a-z]:\//iu.test(normalizedValue) ||
    (Boolean(projectRoot) && normalizedValue === normalizeProjectPath(projectRoot!))
  );
}

function extractShellWriterTargetsFromLine(
  line: string,
  projectRoot: string | null,
  rootVariables: Set<string>
): string[] {
  const normalizedLine = line.trim();

  if (!normalizedLine) {
    return [];
  }

  if (/\b(?:set-content|out-file|add-content)\b/iu.test(normalizedLine)) {
    return extractQuotedSegments(normalizedLine)
      .reverse()
      .map((segment) => normalizeShellPathSegment(segment, projectRoot, rootVariables))
      .filter((target): target is string => Boolean(target))
      .slice(0, 1);
  }

  if (/\bnew-item\b/iu.test(normalizedLine) && /\b-itemtype\s+file\b/iu.test(normalizedLine)) {
    return extractQuotedSegments(normalizedLine)
      .reverse()
      .map((segment) => normalizeShellPathSegment(segment, projectRoot, rootVariables))
      .filter((target): target is string => Boolean(target))
      .slice(0, 1);
  }

  const redirectionMatch = normalizedLine.match(/(?:^|\s)>>?\s*([^\s]+)/u);
  const redirectionTarget = redirectionMatch?.[1]
    ? normalizeShellPathSegment(redirectionMatch[1], projectRoot, rootVariables)
    : null;

  return redirectionTarget ? [redirectionTarget] : [];
}

function extractQuotedSegments(value: string): string[] {
  const segments: string[] = [];
  const pattern = /(["'])(.*?)\1/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match[2]) {
      segments.push(match[2]);
    }
  }

  return segments;
}

function normalizeShellPathSegment(
  segment: string,
  projectRoot: string | null,
  rootVariables: Set<string>
): string | null {
  let normalized = segment
    .trim()
    .replace(/^['"`]+|['"`]+$/gu, "")
    .replace(/\\/gu, "/");

  if (!looksLikeWritableFilePath(normalized)) {
    return null;
  }

  normalized = stripKnownRootVariable(normalized, rootVariables);
  normalized = stripProjectRoot(normalized, projectRoot);
  normalized = normalized.replace(/^\.\//u, "").replace(/^\/+/u, "");

  if (normalized.includes("$")) {
    return null;
  }

  return normalized || null;
}

function looksLikeWritableFilePath(value: string): boolean {
  const normalized = value.replace(/\\/gu, "/");
  const fileName = normalized.split("/").at(-1) ?? normalized;

  return Boolean(
    normalized.includes("$") ||
      normalized.includes("/") ||
      /^[a-z]:\//iu.test(normalized) ||
      /\.[A-Za-z0-9][A-Za-z0-9_.-]{0,15}$/u.test(fileName)
  );
}

function stripKnownRootVariable(value: string, rootVariables: Set<string>): string {
  const variableNames = [...rootVariables].map(escapeRegExp).join("|");
  const variablePattern = new RegExp(`^\\$\\{?(?:${variableNames})\\}?[\\\\/]*`, "iu");

  return value.replace(variablePattern, "");
}

function stripProjectRoot(value: string, projectRoot: string | null): string {
  if (!projectRoot) {
    return value;
  }

  const normalizedRoot = normalizeProjectPath(projectRoot).replace(/\/+$/u, "");
  const normalizedValue = normalizeProjectPath(value);

  if (normalizedValue.toLocaleLowerCase().startsWith(`${normalizedRoot.toLocaleLowerCase()}/`)) {
    return normalizedValue.slice(normalizedRoot.length + 1);
  }

  return value;
}

function normalizeProjectPath(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/^\.\/+/u, "").replace(/\/+/gu, "/");
}

function normalizeCommand(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizePackageRoot(value: string): string {
  const normalized = normalizeProjectPath(value.replace(/^["']|["']$/gu, "")).replace(/\/+$/gu, "");

  return normalized || ".";
}

function readFirstMatchedGroup(match: RegExpMatchArray): string {
  return match.slice(1).find((value): value is string => Boolean(value)) ?? ".";
}

function isSafeRelativeProjectPath(value: string): boolean {
  const normalized = normalizeProjectPath(value);

  return (
    normalized.length > 0 &&
    !/^(?:[a-z]:\/|\/)/iu.test(normalized) &&
    !/[<>:"|?*\r\n]/u.test(normalized) &&
    normalized.split("/").every((segment) => segment && segment !== "." && segment !== "..")
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
