// 本文件说明: 把主进程和模型供应商错误整理成当前界面语言可读的提示
import type { Language } from "@shared/modelTypes";

// 按界面语言清洗普通运行时错误
export function formatRuntimeError(language: Language, error: unknown): string {
  return localizeRuntimeMessage(language, readErrorMessage(error));
}

// 按界面语言清洗远端模型错误, 并折叠 HTML/JSON 噪音
export function formatRemoteModelError(language: Language, error: unknown): string {
  const message = readErrorMessage(error);

  if (/Unexpected token '<'|<!doctype|not valid JSON|returned HTML|返回了 HTML|invalid JSON/i.test(message)) {
    return language === "zh-CN"
      ? "API 返回了 HTML 而不是 JSON，请检查 Base URL 是否指向兼容的 /v1 接口，以及模型 ID 是否正确。"
      : "API returned HTML instead of JSON. Check the Base URL, compatible /v1 endpoint, and model ID.";
  }

  return localizeRuntimeMessage(language, message);
}

// 提取错误文本并移除 Electron IPC 包装前缀
function readErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);

  return rawMessage.replace(/^Error invoking remote method '[^']+':\s*/u, "").trim();
}

// 中文界面下翻译已知英文错误, 英文界面保留原始文本
function localizeRuntimeMessage(language: Language, message: string): string {
  if (language !== "zh-CN") {
    return message;
  }

  return translateKnownEnglishError(message) ?? message;
}

// 翻译历史版本和底层工具可能抛出的英文错误
function translateKnownEnglishError(message: string): string | null {
  const missingKey = message.match(/^(.+) API Key is not configured\.?$/u);
  if (missingKey) {
    return `${missingKey[1]} API Key 未配置，请先在 API 配置中保存密钥。`;
  }

  const missingBaseUrl = message.match(/^(.+) Base URL is not configured\.?$/u);
  if (missingBaseUrl) {
    return `${missingBaseUrl[1]} Base URL 未配置，请检查 API 配置。`;
  }

  const networkFetch = message.match(
    /^(.+) model fetch failed: network request failed(?: \((.*?)\))? Check Base URL.* exposes (.+?)\.?$/u
  );
  if (networkFetch) {
    const [, providerLabel, detail, url] = networkFetch;

    return [
      `无法拉取 ${providerLabel} 模型列表：网络请求失败`,
      detail ? `(${detail})` : "",
      `请检查 Base URL、Electron 代理/网络访问权限，以及该提供商是否开放 ${url}。`
    ]
      .filter(Boolean)
      .join(" ");
  }

  const modelHttp = message.match(/^(.+) model fetch failed: (\d+) ([^-]+?)(?: - (.*))?$/u);
  if (modelHttp) {
    const [, providerLabel, status, statusText, detail] = modelHttp;

    return `无法拉取 ${providerLabel} 模型列表：${status} ${statusText.trim()}${detail ? ` - ${detail}` : ""}`;
  }

  const requestHttp = message.match(
    /^(.+) (agent request|file change request|ask request|ask continuation) failed: (\d+) (.+)$/u
  );
  if (requestHttp) {
    const [, providerLabel, requestKind, status, statusText] = requestHttp;
    const requestLabel = {
      "agent request": "Agent 计划",
      "file change request": "文件修改",
      "ask request": "问答",
      "ask continuation": "问答续写"
    }[requestKind];

    return `${providerLabel} ${requestLabel} 请求失败：${status} ${statusText}`;
  }

  const commandShellStart = message.match(
    /^Command shell (.+?) \((.+?)\) could not be started\. (.+?) Details: (.+)$/u
  );
  if (commandShellStart) {
    const [, shellLabel, executable, hint, detail] = commandShellStart;

    return [
      `无法启动命令 Shell ${shellLabel} (${executable})。`,
      translateShellRecoveryHint(hint),
      `底层错误：${detail}`
    ].join(" ");
  }

  const emptyResponse = message.match(/^(.+) returned an empty response\.?$/u);
  if (emptyResponse) {
    return `${emptyResponse[1]} 返回了空响应。`;
  }

  const emptyAgent = message.match(/^(.+) returned an empty agent response\.?$/u);
  if (emptyAgent) {
    return `${emptyAgent[1]} 返回的 Agent 计划为空。`;
  }

  const emptyFileChange = message.match(/^(.+) returned an empty file change\.?$/u);
  if (emptyFileChange) {
    return `${emptyFileChange[1]} 返回的文件修改内容为空。`;
  }

  const emptyAsk = message.match(/^(.+) returned an empty ask response\.?$/u);
  if (emptyAsk) {
    return `${emptyAsk[1]} 返回的问答内容为空。`;
  }

  const headerNonAscii = message.match(/^(.+) contains non-ASCII characters\./u);
  if (headerNonAscii) {
    return `${headerNonAscii[1]} 包含非 ASCII 字符，请只粘贴原始 API Key，不要包含标签、中文标点或额外说明。`;
  }

  const headerLineBreaks = message.match(/^(.+) contains line breaks\./u);
  if (headerLineBreaks) {
    return `${headerLineBreaks[1]} 包含换行符，请把 API Key 放在同一行。`;
  }

  const projectPathMissing = message.match(/^Project path does not exist: (.+)$/u);
  if (projectPathMissing) {
    return `项目路径不存在：${projectPathMissing[1]}`;
  }

  const projectPathNotDirectory = message.match(/^Project path is not a directory: (.+)$/u);
  if (projectPathNotDirectory) {
    return `项目路径不是目录：${projectPathNotDirectory[1]}`;
  }

  const protectedFilePath = message.match(/^File path is protected by safety policy: (.+)$/u);
  if (protectedFilePath) {
    return `文件路径被安全策略保护, Forge 不会读取或修改: ${translateSensitivePathDetail(
      protectedFilePath[1]
    )}`;
  }

  const existingWorktreePath = message.match(/^Git worktree directory already exists: (.+)$/u);
  if (existingWorktreePath) {
    return `工作树目录已存在：${existingWorktreePath[1]}`;
  }

  const gitCommandFailed = message.match(/^git (.+) failed$/u);
  if (gitCommandFailed) {
    return `git ${gitCommandFailed[1]} 执行失败。`;
  }

  const exactMessages: Record<string, string> = {
    "Agent ask stream cancelled": "已取消 Agent 问答流。",
    "Agent plan stream cancelled": "已取消 Agent 计划流。",
    "Command cwd must stay inside the selected project": "命令工作目录必须位于当前项目内。",
    "Command run id is already active": "该命令运行 ID 已在执行中。",
    "Commit message is required": "请输入提交信息。",
    "Could not read Git repository root": "无法读取 Git 仓库根目录。",
    "Directory path cannot contain parent segments": "目录路径不能包含上级目录。",
    "Directory path must point to a folder": "目录路径必须指向文件夹。",
    "Directory path must stay inside the selected project": "目录路径必须位于当前项目内。",
    "File glob pattern cannot contain parent segments": "文件匹配模式不能包含上级目录。",
    "File glob pattern is required": "文件匹配模式不能为空。",
    "Selected project is not a Git repository": "当前项目不是 Git 仓库。",
    "No changes to commit": "没有可提交的改动。",
    "File path must stay inside the selected project": "文件路径必须位于当前项目内。",
    "File is too large to preview": "文件过大，无法预览。",
    "Git worktree name is required": "请输入工作树名称。",
    "Invalid agent ask request": "无效的 Agent 问答请求。",
    "Invalid agent file change request": "无效的 Agent 文件修改请求。",
    "Invalid agent plan request": "无效的 Agent 计划请求。",
    "Invalid agent stream request ID": "无效的 Agent 流式请求 ID。",
    "Invalid command cancellation request": "无效的命令取消请求。",
    "Invalid command request": "无效的命令请求。",
    "Invalid directory list request": "无效的目录列表请求。",
    "Invalid file glob request": "无效的文件匹配请求。",
    "Invalid file read request": "无效的文件读取请求。",
    "Invalid file search request": "无效的文件搜索请求。",
    "Invalid file update request": "无效的文件更新请求。",
    "Invalid Git commit request": "无效的 Git 提交请求。",
    "Invalid Git status request": "无效的 Git 状态请求。",
    "Invalid Git worktree request": "无效的 Git 工作树请求。",
    "Invalid IPC argument": "无效的 IPC 参数。",
    "Invalid model provider argument": "无效的模型提供商参数。",
    "Invalid project path argument": "无效的项目路径参数。",
    "git status failed": "git status 执行失败。",
    "git worktree create failed": "git worktree 创建失败。",
    "Search query is required": "搜索关键词不能为空。",
    "Secure storage is not available on this system": "当前系统不可用安全存储，无法保存 API Key。",
    "Streaming response body is not available": "流式响应体不可用，请检查当前运行环境或供应商是否支持流式返回。"
  };

  return exactMessages[message] ?? null;
}

function translateShellRecoveryHint(hint: string): string {
  const hints: Record<string, string> = {
    "Choose PowerShell in Settings if Command Prompt is unavailable.":
      "如果 Command Prompt 不可用, 请在设置里改用 PowerShell。",
    "Install Git for Windows or add bash.exe to PATH, then retry the command.":
      "请安装 Git for Windows 或把 bash.exe 加入 PATH, 然后重试命令。",
    "Choose CMD in Settings if PowerShell is unavailable.":
      "如果 PowerShell 不可用, 请在设置里改用 CMD。",
    "Install WSL and a Linux distribution, or choose Windows native in Settings.":
      "请安装 WSL 和 Linux 发行版, 或在设置里改回 Windows 原生。"
  };

  return hints[hint] ?? hint;
}

function translateSensitivePathDetail(detail: string): string {
  const reasonMatch = detail.match(/^(.*) \((.*)\)$/u);

  if (!reasonMatch) {
    return detail;
  }

  const [, path, reason] = reasonMatch;
  const reasons: Record<string, string> = {
    "credential files may contain tokens": "凭据文件可能包含令牌",
    "environment files may contain secrets": "环境变量文件可能包含密钥",
    "path is inside a secret or config directory": "路径位于密钥或配置目录",
    "private key files are blocked": "私钥文件不能交给 Agent 处理",
    "service account files may contain private keys": "服务账号文件可能包含私钥"
  };

  return `${path} (${reasons[reason] ?? reason})`;
}
