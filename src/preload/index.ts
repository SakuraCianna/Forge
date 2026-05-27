import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("forge", {
  appName: "Forge"
});
