// 本文件说明: 提供内置服务 Extension 的共享类型、常量和动作定义工具
import type {
  ExtensionActionDefinition,
  ExtensionManifest
} from "../../shared/extensionTypes.js";
import type { ExtensionActionHandler } from "./qqMailExtension.js";

export type BuiltInServiceExtension = {
  handlers: Record<string, ExtensionActionHandler>;
  manifest: ExtensionManifest;
  summarizeInput?: (actionId: string, input: Record<string, unknown>) => string;
};

export const defaultListLimit = 20;

export function createAction({
  confirmation,
  description,
  id,
  label,
  permission,
  properties,
  required = [],
  risk
}: Pick<
  ExtensionActionDefinition,
  "confirmation" | "description" | "id" | "label" | "permission" | "risk"
> & {
  properties: Record<string, unknown>;
  required?: string[];
}): ExtensionActionDefinition {
  return {
    id,
    description,
    label,
    permission,
    risk,
    confirmation,
    inputSchema: {
      type: "object",
      properties,
      required
    },
    outputSchema: {
      type: "object",
      properties: {}
    }
  };
}
