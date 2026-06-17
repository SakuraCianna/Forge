// 本文件说明: 注册常见外部服务内置 Extension, 通过官方 REST API 执行受控动作
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import { createSourceControlExtensions } from "./serviceSourceControlExtensions.js";
import { createWorkspaceProductivityExtensions } from "./serviceWorkspaceProductivityExtensions.js";
import { createCustomerExtensions } from "./serviceCustomerExtensions.js";
import { createTaskCollaborationExtensions } from "./serviceTaskCollaborationExtensions.js";
import { createCommerceMessagingExtensions } from "./serviceCommerceMessagingExtensions.js";
import { createSchedulingCollaborationExtensions } from "./serviceSchedulingCollaborationExtensions.js";
import { createCloudOfficeExtensions } from "./serviceCloudOfficeExtensions.js";
import { createOperationsExtensions } from "./serviceOperationsExtensions.js";
import { createDeveloperCommunityExtensions } from "./serviceDeveloperCommunityExtensions.js";

export const serviceExtensionDefinitions: BuiltInServiceExtension[] = [
  ...createSourceControlExtensions(),
  ...createWorkspaceProductivityExtensions(),
  ...createCustomerExtensions(),
  ...createTaskCollaborationExtensions(),
  ...createCommerceMessagingExtensions(),
  ...createSchedulingCollaborationExtensions(),
  ...createCloudOfficeExtensions(),
  ...createOperationsExtensions(),
  ...createDeveloperCommunityExtensions()
];

export function createServiceExtensionInputSummary(
  extensionId: string,
  actionId: string,
  input: Record<string, unknown>
): string | null {
  const definition = serviceExtensionDefinitions.find(
    (candidate) => candidate.manifest.id === extensionId
  );

  return definition?.summarizeInput?.(actionId, input) ?? null;
}
