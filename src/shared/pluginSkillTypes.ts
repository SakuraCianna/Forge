// 本文件说明: 定义本机 Codex/Agent skill 扫描结果类型
export type LocalSkillSource = "agents" | "codex" | "plugin-cache";

export type LocalSkillManifest = {
  id: string;
  name: string;
  description: string;
  filePath: string;
  coreFiles: string[];
  source: LocalSkillSource;
  sourceLabel: string;
  pluginName?: string;
};

export type LocalSkillScanResult = {
  skills: LocalSkillManifest[];
  scannedRoots: string[];
  errors: Array<{
    root: string;
    message: string;
  }>;
};
