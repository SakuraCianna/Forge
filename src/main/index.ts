// 本文件说明: 启动 Electron 主窗口并注册所有受控 IPC 能力
import { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell } from "electron";
import { join } from "node:path";
import { registerAgentHandlers } from "./agentIpc.js";
import {
  generateAgentAsk,
  generateAgentAskStream,
  generateAgentFileChange,
  generateAgentPlan
} from "./agentPlanService.js";
import { registerCommandHandlers } from "./commandIpc.js";
import { cancelProjectCommand, runProjectCommand } from "./commandRunner.js";
import { registerGitHandlers } from "./gitIpc.js";
import { commitProjectChanges, getProjectGitStatus } from "./gitService.js";
import { createKeyVault } from "./keyVault.js";
import { registerKeyVaultHandlers } from "./keyVaultIpc.js";
import { registerProjectHandlers } from "./projectIpc.js";
import { registerProjectFileHandlers } from "./projectFileIpc.js";
import {
  previewProjectTextFileUpdate,
  readProjectTextFile,
  writeProjectTextFile
} from "./projectFileService.js";
import { pickProjectDirectory } from "./projectPicker.js";
import { scanProjectFiles } from "./projectScanner.js";
import { fetchModelsForProvider } from "./providerModelService.js";
import { registerProviderModelHandlers } from "./providerModelsIpc.js";
import { windowChannels } from "../shared/ipcChannels.js";

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

// 从 IPC 事件反查发送窗口, 窗口控制按钮只影响当前窗口
function getSenderWindow(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

// 最小化发起 IPC 的窗口, 避免影响其他未来窗口
function minimizeSenderWindow(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void {
  getSenderWindow(event)?.minimize();
}

// 在最大化和还原之间切换当前窗口
function toggleSenderWindowMaximize(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void {
  const window = getSenderWindow(event);

  if (!window) {
    return;
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
}

// 关闭发起 IPC 的窗口, 让自定义标题栏保持原生行为
function closeSenderWindow(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void {
  getSenderWindow(event)?.close();
}

// 创建主窗口并接入预加载脚本, 开发和生产加载路径分开
function createWindow(): void {
  // Windows 使用隐藏标题栏, 自定义顶部工作台区域保持和原生窗口按钮对齐
  const titleBarOptions: Electron.BrowserWindowConstructorOptions =
    process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" }
      : {
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#ffffff",
            symbolColor: "#202123",
            height: 48
          }
        };

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Forge",
    backgroundColor: "#ffffff",
    ...titleBarOptions,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // 主进程集中持有密钥和系统能力, 渲染进程只通过受控 IPC 调用
  const keyVault = createKeyVault({
    directory: join(app.getPath("userData"), "secrets"),
    codec: {
      encryptString: (value) => {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("当前系统不可用安全存储，无法保存 API Key。");
        }

        return safeStorage.encryptString(value);
      },
      decryptString: (value) => safeStorage.decryptString(value)
    }
  });

  registerKeyVaultHandlers(keyVault, (channel, handler) => {
    ipcMain.handle(channel, handler);
  });

  registerProviderModelHandlers(
    (provider) => fetchModelsForProvider({ provider, keyVault }),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  // Agent 调用统一经过主进程, 避免把 provider key 暴露给前端页面
  registerAgentHandlers(
    (request) => generateAgentPlan({ request, keyVault }),
    (request) => generateAgentFileChange({ request, keyVault }),
    (request) => generateAgentAsk({ request, keyVault }),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    },
    (request, onDelta, signal) => generateAgentAskStream({ request, keyVault, onDelta, signal })
  );

  registerProjectHandlers(
    () => pickProjectDirectory(() => dialog.showOpenDialog({ properties: ["openDirectory"] })),
    (rootPath) => scanProjectFiles(rootPath),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  registerCommandHandlers(
    (request) => runProjectCommand(request),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    },
    (request) => cancelProjectCommand(request)
  );

  registerGitHandlers(
    (request) => getProjectGitStatus(request),
    (request) => commitProjectChanges(request),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  registerProjectFileHandlers(
    (request) => readProjectTextFile(request),
    (request) => previewProjectTextFileUpdate(request),
    (request) => writeProjectTextFile(request),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  // 同时注册 invoke 和 send, 兼容不同前端调用方式
  ipcMain.handle(windowChannels.minimize, (event) => minimizeSenderWindow(event));
  ipcMain.handle(windowChannels.toggleMaximize, (event) => toggleSenderWindowMaximize(event));
  ipcMain.handle(windowChannels.close, (event) => closeSenderWindow(event));
  ipcMain.on(windowChannels.minimize, (event) => minimizeSenderWindow(event));
  ipcMain.on(windowChannels.toggleMaximize, (event) => toggleSenderWindowMaximize(event));
  ipcMain.on(windowChannels.close, (event) => closeSenderWindow(event));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
