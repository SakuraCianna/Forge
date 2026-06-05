// 本文件说明: 使用隐藏 Electron 窗口为 Built-in Tools 提供受限本地页面截图和控制台检查
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow } from "electron";

export type BrowserScreenshotRequest = {
  url: string;
  width: number;
  height: number;
  timeoutMs: number;
  waitMs: number;
  fullPage: boolean;
  includeDataUrl: boolean;
  maxInlineBytes: number;
};

export type BrowserConsoleInspectionRequest = {
  url: string;
  width: number;
  height: number;
  timeoutMs: number;
  waitMs: number;
  limit: number;
};

export type BrowserConsoleMessage = {
  level: string;
  message: string;
  lineNumber: number;
  sourceId: string;
};

export type BrowserPreviewTools = {
  takeScreenshot: (request: BrowserScreenshotRequest) => Promise<Record<string, unknown>>;
  inspectPageConsole: (request: BrowserConsoleInspectionRequest) => Promise<Record<string, unknown>>;
};

export function createElectronBrowserPreviewTools({
  screenshotDirectory
}: {
  screenshotDirectory: string;
}): BrowserPreviewTools {
  return {
    takeScreenshot: (request) => takeElectronScreenshot(request, screenshotDirectory),
    inspectPageConsole: inspectElectronPageConsole
  };
}

async function takeElectronScreenshot(
  request: BrowserScreenshotRequest,
  screenshotDirectory: string
): Promise<Record<string, unknown>> {
  const capturedAt = new Date().toISOString();

  return withHiddenBrowserWindow(
    request,
    async ({ browserWindow, consoleMessages }) => {
      if (request.fullPage) {
        await resizeWindowToPage(browserWindow, request);
      }

      const image = await browserWindow.webContents.capturePage();
      const png = image.toPNG();
      const imageSize = image.getSize();
      const fileName = `screenshot-${Date.now()}-${randomUUID()}.png`;
      const imagePath = join(screenshotDirectory, fileName);

      await mkdir(screenshotDirectory, { recursive: true });
      await writeFile(imagePath, png);

      return {
        status: "ok",
        url: request.url,
        imagePath,
        width: imageSize.width,
        height: imageSize.height,
        sizeBytes: png.byteLength,
        capturedAt,
        consoleMessageCount: consoleMessages.length,
        ...(request.includeDataUrl && png.byteLength <= request.maxInlineBytes
          ? { dataUrl: `data:image/png;base64,${png.toString("base64")}` }
          : {}),
        dataUrlIncluded: request.includeDataUrl && png.byteLength <= request.maxInlineBytes,
        dataUrlTruncated: request.includeDataUrl && png.byteLength > request.maxInlineBytes
      };
    }
  );
}

async function inspectElectronPageConsole(
  request: BrowserConsoleInspectionRequest
): Promise<Record<string, unknown>> {
  return withHiddenBrowserWindow(
    request,
    async ({ consoleMessages }) => {
      const messages = consoleMessages.slice(0, request.limit);

      return {
        status: "ok",
        url: request.url,
        messages,
        messageCount: consoleMessages.length,
        errorCount: consoleMessages.filter((message) => message.level === "error").length,
        warningCount: consoleMessages.filter((message) => message.level === "warning").length,
        truncated: consoleMessages.length > request.limit
      };
    }
  );
}

async function withHiddenBrowserWindow<T>(
  request: Pick<BrowserScreenshotRequest, "height" | "timeoutMs" | "url" | "waitMs" | "width">,
  action: ({
    browserWindow,
    consoleMessages
  }: {
    browserWindow: BrowserWindow;
    consoleMessages: BrowserConsoleMessage[];
  }) => Promise<T>
): Promise<T> {
  const browserWindow = new BrowserWindow({
    show: false,
    width: request.width,
    height: request.height,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const consoleMessages: BrowserConsoleMessage[] = [];

  browserWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  browserWindow.webContents.on("console-message", (details) => {
    consoleMessages.push({
      level: readConsoleLevel(details),
      message: readConsoleMessage(details),
      lineNumber: readConsoleLineNumber(details),
      sourceId: readConsoleSourceId(details)
    });
  });

  try {
    await loadBrowserPreviewUrl(browserWindow, request);
    await wait(request.waitMs);

    return await action({ browserWindow, consoleMessages });
  } finally {
    if (!browserWindow.isDestroyed()) {
      browserWindow.destroy();
    }
  }
}

async function loadBrowserPreviewUrl(
  browserWindow: BrowserWindow,
  request: Pick<BrowserScreenshotRequest, "timeoutMs" | "url">
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await withTimeout(
        browserWindow.loadURL(request.url),
        request.timeoutMs,
        `Timed out loading browser preview URL: ${request.url}`
      );
      return;
    } catch (error) {
      lastError = error;

      if (attempt >= 2 || !isRecoverableBrowserLoadError(error)) {
        throw error;
      }

      await wait(300);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function resizeWindowToPage(
  browserWindow: BrowserWindow,
  request: BrowserScreenshotRequest
): Promise<void> {
  const measuredSize = await browserWindow.webContents
    .executeJavaScript(
      `(() => ({
        width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth)),
        height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight))
      }))()`,
      true
    )
    .catch(() => null);

  if (!isRecord(measuredSize)) {
    return;
  }

  const width = clampNumber(readNumber(measuredSize.width), 320, 4096, request.width);
  const height = clampNumber(readNumber(measuredSize.height), 240, 4096, request.height);

  browserWindow.setContentSize(width, height);
  await wait(100);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function isRecoverableBrowserLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /ERR_NO_BUFFER_SPACE/u.test(message);
}

function clampNumber(
  value: number | null,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === null) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readConsoleLevel(details: unknown): string {
  if (!isRecord(details)) {
    return "info";
  }

  return typeof details.level === "string" ? details.level : "info";
}

function readConsoleMessage(details: unknown): string {
  if (!isRecord(details)) {
    return "";
  }

  return typeof details.message === "string" ? details.message : "";
}

function readConsoleLineNumber(details: unknown): number {
  if (!isRecord(details)) {
    return 0;
  }

  return typeof details.lineNumber === "number" && Number.isFinite(details.lineNumber)
    ? details.lineNumber
    : 0;
}

function readConsoleSourceId(details: unknown): string {
  if (!isRecord(details)) {
    return "";
  }

  return typeof details.sourceId === "string" ? details.sourceId : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
