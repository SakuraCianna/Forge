// 本文件说明: 定义 Agent 不应读取或修改的敏感项目路径
const envTemplateFileNames = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.defaults"
]);

const sensitiveDirectoryNames = new Set([
  ".aws",
  ".azure",
  ".docker",
  ".git",
  ".gnupg",
  ".kube",
  ".ssh",
  ".secrets",
  "secrets"
]);

const sensitiveExactFileNames = new Set([
  ".netrc",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "firebase-adminsdk.json",
  "service-account.json",
  "secrets.json",
  "token.json"
]);

const privateKeyFileNames = new Set([
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa"
]);

const privateKeyExtensions = [".key", ".p12", ".pem", ".pfx"];

// 判断项目相对路径是否命中敏感文件策略, 返回用户可读原因
export function getSensitiveProjectPathReason(relativePath: string): string | null {
  const normalizedPath = normalizeProjectPathForPolicy(relativePath);

  if (!normalizedPath) {
    return null;
  }

  const segments = normalizedPath.split("/");
  const fileName = segments.at(-1) ?? "";

  if (segments.some((segment) => sensitiveDirectoryNames.has(segment))) {
    return "路径位于密钥或配置目录";
  }

  if (isEnvironmentFileName(fileName)) {
    return "环境变量文件可能包含密钥";
  }

  if (sensitiveExactFileNames.has(fileName)) {
    return "凭据文件可能包含令牌";
  }

  if (privateKeyFileNames.has(fileName) || privateKeyExtensions.some((extension) => fileName.endsWith(extension))) {
    return "私钥文件不能交给 Agent 处理";
  }

  if (/service[-_]?account.*\.json$/u.test(fileName)) {
    return "服务账号文件可能包含私钥";
  }

  return null;
}

// 判断项目相对路径是否需要从扫描和文件工具中隐藏
export function isSensitiveProjectPath(relativePath: string): boolean {
  return Boolean(getSensitiveProjectPathReason(relativePath));
}

// 在文件工具入口统一拦截敏感路径, 避免读写逻辑各自遗漏
export function assertProjectPathNotSensitive(relativePath: string): void {
  const reason = getSensitiveProjectPathReason(relativePath);

  if (!reason) {
    return;
  }

  throw new Error(`文件路径被安全策略保护, Forge 不会读取或修改: ${relativePath} (${reason})`);
}

// 识别 .env 类文件, 但允许常见模板文件进入上下文
function isEnvironmentFileName(fileName: string): boolean {
  return fileName.startsWith(".env") && !envTemplateFileNames.has(fileName);
}

// 统一路径大小写和分隔符, 让 Windows 与 POSIX 路径命中同一套规则
function normalizeProjectPathForPolicy(relativePath: string): string {
  return relativePath.trim().replace(/\\/g, "/").replace(/^\.\//u, "").toLocaleLowerCase();
}
