// 本文件说明: 为 Go 验证命令提供旧工具链兼容降级

type CommandResultLike = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled?: boolean;
};

export type GoVerificationFallback = {
  command: "go test ./...";
  cwd: string;
  moduleRoot: string;
};

const goCVerificationPattern =
  /^go\s+-c\s+(?:"((?:\\"|[^"])*)"|(\S+))\s+test\s+\.\/\.\.\.\s*$/iu;

export function resolveGoCVerificationFallback(
  command: string,
  result: CommandResultLike,
  projectRoot: string
): GoVerificationFallback | null {
  const moduleRoot = parseGoCVerificationModuleRoot(command);

  if (!moduleRoot || !isGoCUnsupportedResult(result)) {
    return null;
  }

  return {
    command: "go test ./...",
    cwd: joinProjectRelativePath(projectRoot, moduleRoot),
    moduleRoot
  };
}

export function parseGoCVerificationModuleRoot(command: string): string | null {
  const match = goCVerificationPattern.exec(command.trim());

  if (!match) {
    return null;
  }

  const rawPath = match[1] ?? match[2] ?? "";
  const unescapedPath = rawPath.replace(/\\"/gu, "\"");
  const normalizedPath = normalizeRelativeCommandPath(unescapedPath);

  return normalizedPath;
}

function isGoCUnsupportedResult(result: CommandResultLike): boolean {
  if (result.exitCode === 0 || result.timedOut || result.cancelled) {
    return false;
  }

  const output = `${result.stderr}\n${result.stdout}`.toLocaleLowerCase();

  return (
    /flag provided but not defined:\s*-c/u.test(output) ||
    /unknown (?:flag|shorthand flag):\s*-c/u.test(output) ||
    /go:\s+unknown flag\s+-c/u.test(output)
  );
}

function normalizeRelativeCommandPath(value: string): string | null {
  const normalized = value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "");

  if (
    !normalized ||
    normalized.includes("\n") ||
    normalized.startsWith("/") ||
    /^[a-z]:\//iu.test(normalized) ||
    normalized.startsWith("//")
  ) {
    return null;
  }

  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");

  if (segments.some((segment) => segment === "..")) {
    return null;
  }

  return segments.join("/");
}

function joinProjectRelativePath(projectRoot: string, relativePath: string): string {
  const separator = projectRoot.includes("\\") ? "\\" : "/";
  const trimmedRoot = projectRoot.replace(/[\\/]+$/u, "");
  const platformRelativePath = relativePath.replace(/\//gu, separator);

  return `${trimmedRoot}${separator}${platformRelativePath}`;
}
