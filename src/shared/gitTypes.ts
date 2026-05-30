// 本文件说明: 共享模块 Git 共享类型
export type ProjectGitFileChange = {
  path: string;
  status: string;
  diff: string;
};

export type ProjectGitStatus = {
  isRepo: boolean;
  changedFiles: string[];
  changes: ProjectGitFileChange[];
  rawStatus: string;
};

export type ProjectGitStatusRequest = {
  projectRoot: string;
};

export type ProjectGitCommitRequest = {
  projectRoot: string;
  message: string;
};

export type ProjectGitCommitResult = {
  output: string;
  status: ProjectGitStatus;
};
