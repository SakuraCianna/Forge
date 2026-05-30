// 本文件说明: 定义 Git 状态, diff 和提交结果的数据结构
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

export type ProjectGitWorktreeRequest = {
  projectRoot: string;
  name: string;
};

export type ProjectGitWorktreeResult = {
  path: string;
  branch: string;
  output: string;
};
