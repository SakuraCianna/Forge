import { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell } from "electron";
import { join } from "node:path";
import { registerAgentHandlers } from "./agentIpc.js";
import { generateAgentFileChange, generateAgentPlan } from "./agentPlanService.js";
import { registerCommandHandlers } from "./commandIpc.js";
import { runProjectCommand } from "./commandRunner.js";
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

function getSenderWindow(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function minimizeSenderWindow(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void {
  getSenderWindow(event)?.minimize();
}

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

function closeSenderWindow(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void {
  getSenderWindow(event)?.close();
}

function createWindow(): void {
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
      preload: join(__dirname, "../preload/index.js"),
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

  const keyVault = createKeyVault({
    directory: join(app.getPath("userData"), "secrets"),
    codec: {
      encryptString: (value) => {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("Secure storage is not available on this system");
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

  registerAgentHandlers(
    (request) => generateAgentPlan({ request, keyVault }),
    (request) => generateAgentFileChange({ request, keyVault }),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
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
    }
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
