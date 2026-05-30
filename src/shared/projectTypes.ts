export type ProjectFile = {
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
