// 本文件说明: 为空项目脚手架计划补齐缺失工程层, 不在入口质量文件里堆叠框架细节。
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";

export type ScaffoldLayer =
  | "foundation"
  | "backendEntry"
  | "domainModel"
  | "api"
  | "runtimeConfig"
  | "dataSeed"
  | "frontendConfig"
  | "frontendEntry"
  | "frontendApiClient"
  | "frontendPage"
  | "verification";

type ScaffoldStack = {
  springBoot: boolean;
  h2: boolean;
  vue: boolean;
  react: boolean;
  vite: boolean;
  frontend: boolean;
  backend: boolean;
  separated: boolean;
};

type ScaffoldCompletionCandidate = {
  layer: ScaffoldLayer;
  kind: "edit-file" | "run-command";
  label: string;
  target?: string;
  command?: string;
};

// 空项目是 Forge 最容易显得“没工程意识”的场景: 模型可能只计划 pom.xml 或一个入口文件。
// 这里不生成具体代码内容, 只补齐缺失的受控 edit/verify 动作, 后续仍由文件编辑器逐个生成 diff。
export function supplementBareProjectScaffoldActions({
  actions,
  bareProject,
  isCreationTask,
  prompt
}: {
  actions: AgentAction[];
  bareProject: boolean;
  isCreationTask: boolean;
  prompt: string;
}): {
  actions: AgentAction[];
  addedActions: number;
  missingLayers: ScaffoldLayer[];
} {
  if (!isCreationTask) {
    return {
      actions,
      addedActions: 0,
      missingLayers: []
    };
  }

  const normalizedActions = normalizeBareScaffoldActionRoots(actions, prompt, {
    canonicalizeAliasRoots: bareProject
  });

  if (!bareProject) {
    return {
      actions: normalizedActions,
      addedActions: 0,
      missingLayers: []
    };
  }

  const expectedLayers = getExpectedScaffoldLayers(prompt);

  if (expectedLayers.length === 0) {
    return {
      actions: normalizedActions,
      addedActions: 0,
      missingLayers: []
    };
  }

  const coveredLayers = detectCoveredScaffoldLayers(normalizedActions);
  const missingLayers = expectedLayers.filter((layer) => !coveredLayers.has(layer));
  const completionActions = createScaffoldCompletionActions(prompt, missingLayers, normalizedActions);

  if (completionActions.length === 0) {
    return {
      actions: normalizedActions,
      addedActions: 0,
      missingLayers
    };
  }

  return {
    actions: insertScaffoldCompletionActions(normalizedActions, completionActions),
    addedActions: completionActions.length,
    missingLayers
  };
}

export function formatScaffoldLayerLabels(layers: ScaffoldLayer[], language: Language): string {
  const labels = layers.map((layer) => formatScaffoldLayerLabel(layer, language));

  return labels.length > 0
    ? labels.join(language === "zh-CN" ? "、" : ", ")
    : language === "zh-CN"
      ? "关键层"
      : "key layers";
}

function getExpectedScaffoldLayers(prompt: string): ScaffoldLayer[] {
  const stack = detectScaffoldStack(prompt);
  const layers = new Set<ScaffoldLayer>();

  if (stack.backend || stack.springBoot) {
    layers.add("foundation");
    layers.add("backendEntry");
    layers.add("domainModel");
    layers.add("api");
    layers.add("runtimeConfig");
    if (stack.springBoot && stack.h2) {
      layers.add("dataSeed");
    }
    layers.add("verification");
  }

  if (stack.frontend || stack.vue || stack.react || stack.vite) {
    layers.add("frontendConfig");
    layers.add("frontendEntry");
    if (stack.backend || stack.springBoot) {
      layers.add("frontendApiClient");
    }
    layers.add("frontendPage");
    layers.add("verification");
  }

  return [...layers];
}

function detectCoveredScaffoldLayers(actions: AgentAction[]): Set<ScaffoldLayer> {
  const coveredLayers = new Set<ScaffoldLayer>();
  const frontendConfigFiles = new Set<"index" | "package" | "tsconfig" | "vite">();

  for (const action of actions) {
    const target = normalizeProjectPath(action.target ?? "");
    const command = action.command?.trim() ?? "";
    const isFrontendTarget = /(^|\/)(frontend|client|web)\//iu.test(target);

    if (
      /(^|\/)(pom\.xml|build\.gradle(?:\.kts)?|go\.mod|pyproject\.toml)$/iu.test(target) ||
      (!isFrontendTarget && /(^|\/)package\.json$/iu.test(target))
    ) {
      coveredLayers.add("foundation");
    }

    if (/(^|\/)(frontend|client|web)\/package\.json$/iu.test(target)) {
      frontendConfigFiles.add("package");
    }

    if (/(^|\/)(frontend|client|web)\/vite\.config\.[jt]s$/iu.test(target)) {
      frontendConfigFiles.add("vite");
    }

    if (/(^|\/)(frontend|client|web)\/tsconfig\.json$/iu.test(target)) {
      frontendConfigFiles.add("tsconfig");
    }

    if (/(^|\/)(frontend|client|web)\/index\.html$/iu.test(target)) {
      frontendConfigFiles.add("index");
    }

    if (/(^|\/)src\/main\/(?:java|kotlin)\/.*application\.(?:java|kt)$/iu.test(target)) {
      coveredLayers.add("backendEntry");
    }

    if (/(^|\/)(entity|model|domain)\/[^/]+\.(?:java|kt|ts|js|py)$/iu.test(target)) {
      coveredLayers.add("domainModel");
    }

    if (/(^|\/)(controller|routes?|api)\/[^/]+\.(?:java|kt|ts|js|py)$/iu.test(target)) {
      coveredLayers.add("api");
    }

    if (/(^|\/)(application\.(?:ya?ml|properties)|\.env(?:\.example)?|config\/[^/]+)$/iu.test(target)) {
      coveredLayers.add("runtimeConfig");
    }

    if (/(^|\/)src\/main\/resources\/(?:data|schema)\.sql$/iu.test(target)) {
      coveredLayers.add("dataSeed");
    }

    if (/(^|\/)(frontend|client|web)\/src\/main\.[jt]s$/iu.test(target)) {
      coveredLayers.add("frontendEntry");
    }

    if (/(^|\/)(frontend|client|web)\/src\/(?:api|services)\/[^/]+\.[jt]s$/iu.test(target)) {
      coveredLayers.add("frontendApiClient");
    }

    if (
      /(^|\/)(frontend|client|web)\/src\/(?:App\.vue|App\.[jt]sx?|components\/[^/]+\.(?:vue|[jt]sx?))$/iu.test(
        target
      )
    ) {
      coveredLayers.add("frontendPage");
    }

    if (
      action.kind === "run-command" &&
      /(test|build|lint|typecheck|verify|mvn|gradle|npm|pnpm|yarn)/iu.test(command)
    ) {
      coveredLayers.add("verification");
    }
  }

  if (
    frontendConfigFiles.has("package") &&
    frontendConfigFiles.has("vite") &&
    frontendConfigFiles.has("tsconfig") &&
    frontendConfigFiles.has("index")
  ) {
    coveredLayers.add("frontendConfig");
  }

  return coveredLayers;
}

function createScaffoldCompletionActions(
  prompt: string,
  missingLayers: ScaffoldLayer[],
  actions: AgentAction[]
): AgentAction[] {
  const stack = detectScaffoldStack(prompt);
  const projectSlug = inferProjectSlug(prompt);
  const roots = resolveScaffoldRoots(stack);
  const javaRoot = `${roots.backendRoot}src/main/java/com/example/${projectSlug}`;
  const existingTargets = new Set(
    actions.flatMap((action) => [action.target, action.command]).filter((value): value is string => Boolean(value))
  );
  const candidates: ScaffoldCompletionCandidate[] = [];

  for (const layer of missingLayers) {
    candidates.push(
      ...createScaffoldLayerCandidates(layer, {
        stack,
        projectSlug,
        backendRoot: roots.backendRoot,
        javaRoot,
        frontendRoot: roots.frontendRoot
      })
    );
  }

  return candidates
    .filter((candidate) => {
      const key = candidate.target ?? candidate.command;

      return typeof key === "string" && !existingTargets.has(key);
    })
    .map((candidate, index) => ({
      id: `plan-quality-scaffold-${index + 1}`,
      stepId: "plan-quality-scaffold",
      kind: candidate.kind,
      label: candidate.label,
      status: "pending",
      target: candidate.target,
      command: candidate.command
    }));
}

function insertScaffoldCompletionActions(
  actions: AgentAction[],
  completionActions: AgentAction[]
): AgentAction[] {
  const firstVerificationIndex = actions.findIndex(isScaffoldVerificationAction);

  if (firstVerificationIndex < 0) {
    return [...actions, ...completionActions];
  }

  return [
    ...actions.slice(0, firstVerificationIndex),
    ...completionActions,
    ...actions.slice(firstVerificationIndex)
  ];
}

function isScaffoldVerificationAction(action: AgentAction): boolean {
  const command = action.command?.trim() ?? "";

  return (
    action.kind === "run-command" &&
    /(test|build|lint|typecheck|verify|mvn|gradle|npm|pnpm|yarn)/iu.test(command)
  );
}

function createScaffoldLayerCandidates(
  layer: ScaffoldLayer,
  context: {
    stack: ScaffoldStack;
    projectSlug: string;
    backendRoot: string;
    javaRoot: string;
    frontendRoot: string;
  }
): ScaffoldCompletionCandidate[] {
  const { stack, projectSlug, backendRoot, javaRoot, frontendRoot } = context;
  const entityName = inferDomainEntityName(projectSlug);
  const entityResourceName = toPluralResourceName(entityName);

  switch (layer) {
    case "foundation":
      return stack.springBoot
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${backendRoot}pom.xml`,
              target: `${backendRoot}pom.xml`
            }
          ]
        : [];
    case "backendEntry":
      return stack.springBoot
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${javaRoot}/${toPascalCase(projectSlug)}Application.java`,
              target: `${javaRoot}/${toPascalCase(projectSlug)}Application.java`
            }
          ]
        : [];
    case "domainModel":
      return stack.backend || stack.springBoot
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${javaRoot}/entity/${entityName}.java`,
              target: `${javaRoot}/entity/${entityName}.java`
            },
            {
              layer,
              kind: "edit-file",
              label: `创建 ${javaRoot}/repository/${entityName}Repository.java`,
              target: `${javaRoot}/repository/${entityName}Repository.java`
            }
          ]
        : [];
    case "api":
      return stack.backend || stack.springBoot
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${javaRoot}/controller/${entityName}Controller.java`,
              target: `${javaRoot}/controller/${entityName}Controller.java`
            }
          ]
        : [];
    case "runtimeConfig":
      return stack.springBoot
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${backendRoot}src/main/resources/application.yml`,
              target: `${backendRoot}src/main/resources/application.yml`
            }
          ]
        : [];
    case "dataSeed":
      return stack.springBoot && stack.h2
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${backendRoot}src/main/resources/data.sql`,
              target: `${backendRoot}src/main/resources/data.sql`
            }
          ]
        : [];
    case "frontendConfig":
      return stack.frontend || stack.vue || stack.react || stack.vite
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${frontendRoot}package.json`,
              target: `${frontendRoot}package.json`
            },
            {
              layer,
              kind: "edit-file",
              label: `创建 ${frontendRoot}tsconfig.json`,
              target: `${frontendRoot}tsconfig.json`
            },
            {
              layer,
              kind: "edit-file",
              label: `创建 ${frontendRoot}vite.config.ts`,
              target: `${frontendRoot}vite.config.ts`
            },
            {
              layer,
              kind: "edit-file",
              label: `创建 ${frontendRoot}index.html`,
              target: `${frontendRoot}index.html`
            }
          ]
        : [];
    case "frontendEntry":
      return stack.frontend || stack.vue || stack.react || stack.vite
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${frontendRoot}src/main.ts`,
              target: `${frontendRoot}src/main.ts`
            }
          ]
        : [];
    case "frontendApiClient":
      return stack.frontend || stack.vue || stack.react || stack.vite
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${frontendRoot}src/api/${entityResourceName}.ts`,
              target: `${frontendRoot}src/api/${entityResourceName}.ts`
            }
          ]
        : [];
    case "frontendPage":
      return stack.frontend || stack.vue
        ? [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${frontendRoot}src/App.vue`,
              target: `${frontendRoot}src/App.vue`
            }
          ]
        : [
            {
              layer,
              kind: "edit-file",
              label: `创建 ${frontendRoot}src/App.tsx`,
              target: `${frontendRoot}src/App.tsx`
            }
          ];
    case "verification":
      return createVerificationCandidates(stack, backendRoot, frontendRoot);
  }
}

function createVerificationCandidates(
  stack: ScaffoldStack,
  backendRoot: string,
  frontendRoot: string
): ScaffoldCompletionCandidate[] {
  const candidates: ScaffoldCompletionCandidate[] = [];

  if (stack.springBoot) {
    const command = backendRoot
      ? `mvn -f ${backendRoot}pom.xml -DskipTests package`
      : "mvn -DskipTests package";

    candidates.push({
      layer: "verification",
      kind: "run-command",
      label: `运行命令 ${command}`,
      command
    });
  }

  if (stack.frontend || stack.vue || stack.react || stack.vite) {
    const command = frontendRoot ? `npm --prefix ${frontendRoot.replace(/\/$/u, "")} run build` : "npm run build";

    candidates.push({
      layer: "verification",
      kind: "run-command",
      label: `运行命令 ${command}`,
      command
    });
  }

  return candidates;
}

function detectScaffoldStack(prompt: string): ScaffoldStack {
  const normalizedPrompt = prompt.toLocaleLowerCase();
  const springBoot = /spring\s*boot|springboot/u.test(normalizedPrompt);
  const h2 = /\bh2\b/u.test(normalizedPrompt);
  const vue = /\bvue\b|vue3|vue\s*3/u.test(normalizedPrompt);
  const react = /\breact\b/u.test(normalizedPrompt);
  const vite = /\bvite\b/u.test(normalizedPrompt) || vue || react;
  const frontend = /(前端|frontend|front-end|client|页面)/iu.test(prompt) || vue || react || vite;
  const backend = /(后端|backend|back-end|server|接口|api|数据库|database)/iu.test(prompt) || springBoot;
  const separated = /(前后端分离|frontend.*backend|backend.*frontend|client.*server|server.*client)/iu.test(prompt);

  return {
    springBoot,
    h2,
    vue,
    react,
    vite,
    frontend,
    backend,
    separated
  };
}

function resolveScaffoldRoots(stack: ScaffoldStack): {
  backendRoot: string;
  frontendRoot: string;
} {
  return {
    // Forge 的空项目全栈脚手架约定: Java/Spring 后端放在 backend, 前端放在 frontend。
    backendRoot: stack.separated ? "backend/" : "",
    frontendRoot: stack.separated || stack.backend ? "frontend/" : ""
  };
}

function normalizeBareScaffoldActionRoots(
  actions: AgentAction[],
  prompt: string,
  options: { canonicalizeAliasRoots: boolean }
): AgentAction[] {
  const stack = detectScaffoldStack(prompt);

  if (!stack.separated || !(stack.backend || stack.springBoot)) {
    return actions;
  }

  const roots = resolveScaffoldRoots(stack);

  return actions.map((action) => {
    const nextTarget = action.target
      ? normalizeBareScaffoldTarget(action.target, roots, options)
      : action.target;
    const nextCommand = action.command
      ? normalizeBareScaffoldCommand(action.command, roots, options)
      : action.command;

    if (nextTarget === action.target && nextCommand === action.command) {
      return action;
    }

    return {
      ...action,
      label: rewriteActionLabel(action, nextTarget, nextCommand),
      target: nextTarget,
      command: nextCommand
    };
  });
}

function normalizeBareScaffoldTarget(
  target: string,
  roots: {
    backendRoot: string;
    frontendRoot: string;
  },
  options: { canonicalizeAliasRoots: boolean }
): string {
  return normalizeBareFrontendTarget(
    normalizeBareBackendTarget(target, roots.backendRoot),
    roots.frontendRoot,
    options
  );
}

function normalizeBareScaffoldCommand(
  command: string,
  roots: {
    backendRoot: string;
    frontendRoot: string;
  },
  options: { canonicalizeAliasRoots: boolean }
): string {
  return normalizeBareFrontendCommand(
    normalizeBareBackendCommand(command, roots.backendRoot, options),
    roots.frontendRoot,
    options
  );
}

function normalizeBareBackendTarget(target: string, backendRoot: string): string {
  const normalizedTarget = normalizeProjectPath(target);

  if (!backendRoot || normalizedTarget.startsWith(backendRoot)) {
    return normalizedTarget;
  }

  if (normalizedTarget.toLocaleLowerCase().startsWith("backend/")) {
    return `${backendRoot}${normalizedTarget.slice("backend/".length)}`;
  }

  if (isRootSpringBootTarget(normalizedTarget)) {
    return `${backendRoot}${normalizedTarget}`;
  }

  return normalizedTarget;
}

function normalizeBareFrontendTarget(
  target: string,
  frontendRoot: string,
  options: { canonicalizeAliasRoots: boolean }
): string {
  const normalizedTarget = normalizeProjectPath(target);

  if (!frontendRoot || normalizedTarget.startsWith(frontendRoot)) {
    return normalizedTarget;
  }

  const roots = options.canonicalizeAliasRoots
    ? ["frontend/", "client/", "web/"]
    : ["frontend/"];

  for (const legacyRoot of roots) {
    if (normalizedTarget.toLocaleLowerCase().startsWith(legacyRoot)) {
      return `${frontendRoot}${normalizedTarget.slice(legacyRoot.length)}`;
    }
  }

  return normalizedTarget;
}

function normalizeBareBackendCommand(
  command: string,
  backendRoot: string,
  options: { canonicalizeAliasRoots: boolean }
): string {
  const backendPom = `${backendRoot}pom.xml`;
  const trimmedCommand = command.trim();

  if (!backendRoot) {
    return trimmedCommand;
  }

  const commandWithCanonicalPom = trimmedCommand.replace(
    /\bbackend[\\/]+pom\.xml\b/giu,
    backendPom
  );

  if (options.canonicalizeAliasRoots) {
    const mavenTestPattern = new RegExp(
      `^mvn\\s+-f\\s+${escapeRegExp(backendPom)}\\s+test\\b`,
      "iu"
    );

    if (mavenTestPattern.test(commandWithCanonicalPom)) {
      return commandWithCanonicalPom.replace(
        mavenTestPattern,
        `mvn -f ${backendPom} -DskipTests package`
      );
    }
  }

  if (/^mvn\s+test\b/iu.test(commandWithCanonicalPom)) {
    return commandWithCanonicalPom.replace(
      /^mvn\s+test\b/iu,
      options.canonicalizeAliasRoots
        ? `mvn -f ${backendPom} -DskipTests package`
        : `mvn -f ${backendPom} test`
    );
  }

  return commandWithCanonicalPom;
}

function normalizeBareFrontendCommand(
  command: string,
  frontendRoot: string,
  options: { canonicalizeAliasRoots: boolean }
): string {
  const trimmedCommand = command.trim();

  if (!frontendRoot) {
    return trimmedCommand;
  }

  const rootPattern = options.canonicalizeAliasRoots ? "frontend|client|web" : "frontend";

  return trimmedCommand.replace(
    new RegExp(`\\b(?:${rootPattern})(?=\\s+(?:install|run|test|build)|[\\\\/])`, "giu"),
    frontendRoot.replace(/\/$/u, "")
  );
}

function isRootSpringBootTarget(target: string): boolean {
  return (
    /^(?:pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?)$/iu.test(target) ||
    /^src\/(?:main|test)\/(?:java|kotlin|resources)\//iu.test(target)
  );
}

function rewriteActionLabel(
  action: AgentAction,
  target: string | undefined,
  command: string | undefined
): string {
  if (action.kind === "run-command" && command) {
    return `运行命令 ${command}`;
  }

  if (target) {
    return `${action.kind === "edit-file" ? "创建" : "处理"} ${target}`;
  }

  return action.label;
}

function inferProjectSlug(prompt: string): string {
  if (/(学生|student)/iu.test(prompt)) {
    return "studentmanager";
  }

  if (/(用户|user)/iu.test(prompt)) {
    return "usermanager";
  }

  if (/(订单|order)/iu.test(prompt)) {
    return "ordermanager";
  }

  return "app";
}

function inferDomainEntityName(projectSlug: string): string {
  if (projectSlug === "studentmanager") {
    return "Student";
  }

  if (projectSlug === "usermanager") {
    return "User";
  }

  if (projectSlug === "ordermanager") {
    return "Order";
  }

  return "Item";
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-z0-9]+/iu)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toLocaleUpperCase()}${segment.slice(1)}`)
    .join("");
}

function toPluralResourceName(entityName: string): string {
  const normalizedName = entityName.trim().toLocaleLowerCase();

  if (!normalizedName) {
    return "items";
  }

  if (/[^aeiou]y$/u.test(normalizedName)) {
    return `${normalizedName.slice(0, -1)}ies`;
  }

  if (/(?:s|x|z|ch|sh)$/u.test(normalizedName)) {
    return `${normalizedName}es`;
  }

  return `${normalizedName}s`;
}

function formatScaffoldLayerLabel(layer: ScaffoldLayer, language: Language): string {
  const zhLabels: Record<ScaffoldLayer, string> = {
    foundation: "依赖/构建配置",
    backendEntry: "后端入口",
    domainModel: "领域模型",
    api: "API",
    runtimeConfig: "运行配置",
    dataSeed: "数据库初始化",
    frontendConfig: "前端配置",
    frontendEntry: "前端入口",
    frontendApiClient: "前端 API 客户端",
    frontendPage: "页面组件",
    verification: "验证命令"
  };
  const enLabels: Record<ScaffoldLayer, string> = {
    foundation: "build config",
    backendEntry: "backend entrypoint",
    domainModel: "domain model",
    api: "API",
    runtimeConfig: "runtime config",
    dataSeed: "database seed data",
    frontendConfig: "frontend config",
    frontendEntry: "frontend entrypoint",
    frontendApiClient: "frontend API client",
    frontendPage: "UI page",
    verification: "verification command"
  };

  return language === "zh-CN" ? zhLabels[layer] : enLabels[layer];
}

function normalizeProjectPath(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/^\.\/+/u, "").replace(/\/+/gu, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
