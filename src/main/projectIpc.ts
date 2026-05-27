import { projectChannels } from "../shared/ipcChannels.js";

type PickProjectDirectory = () => Promise<string | null>;

type IpcHandler = (_event: unknown) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { projectChannels };

export function registerProjectHandlers(
  pickProjectDirectory: PickProjectDirectory,
  registerHandler: RegisterHandler
): void {
  registerHandler(projectChannels.pickDirectory, async () => pickProjectDirectory());
}
