// 本文件说明: 定义项目扫描结果, 文件索引和说明文件类型
export type ProjectFile = {
  modifiedAtMs?: number;
  relativePath: string;
  size: number;
};

export type ProjectInstructionFile = {
  relativePath: string;
  content: string;
  truncated: boolean;
};

export type ProjectScanResult = {
  rootPath: string;
  files: ProjectFile[];
  truncated: boolean;
  instructionFiles?: ProjectInstructionFile[];
};
