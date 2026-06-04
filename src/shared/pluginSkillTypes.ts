// 本文件说明: 定义本机 Codex/Agent skill 扫描结果类型
export type LocalSkillSource = "agents" | "codex" | "plugin-cache" | "plugin-local";

export type LocalSkillManifest = {
  id: string;
  name: string;
  description: string;
  filePath: string;
  coreFiles: string[];
  source: LocalSkillSource;
  sourceLabel: string;
  pluginName?: string;
  directoryPath: string;
  editable: boolean;
  deletable: boolean;
  userOwned: boolean;
};

export type LocalSkillScanResult = {
  skills: LocalSkillManifest[];
  scannedRoots: string[];
  errors: Array<{
    root: string;
    message: string;
  }>;
};

export type LocalSkillFileContent = {
  filePath: string;
  content: string;
  size: number;
};

export type LocalPluginSkillCreateKind = "plugin" | "skill";

export type LocalPluginSkillCreateRequest = {
  kind: LocalPluginSkillCreateKind;
  name: string;
  description?: string;
};

export type LocalPluginSkillCreateResult = {
  kind: LocalPluginSkillCreateKind;
  id: string;
  name: string;
  directoryPath: string;
  primaryFilePath: string;
  createdFiles: string[];
  scanResult: LocalSkillScanResult;
};

export type LocalPluginSkillUpdateRequest = {
  kind: LocalPluginSkillCreateKind;
  filePath: string;
  name: string;
  description?: string;
};

export type LocalPluginSkillUpdateResult = {
  kind: LocalPluginSkillCreateKind;
  id: string;
  name: string;
  directoryPath: string;
  updatedFiles: string[];
  scanResult: LocalSkillScanResult;
};

export type LocalPluginSkillDeleteRequest = {
  kind: LocalPluginSkillCreateKind;
  filePath: string;
};

export type LocalPluginSkillDeleteResult = {
  kind: LocalPluginSkillCreateKind;
  deletedPath: string;
  scanResult: LocalSkillScanResult;
};
