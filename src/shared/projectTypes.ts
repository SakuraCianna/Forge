export type ProjectFile = {
  relativePath: string;
  size: number;
};

export type ProjectScanResult = {
  rootPath: string;
  files: ProjectFile[];
  truncated: boolean;
};
