export type ProjectGitStatus = {
  isRepo: boolean;
  changedFiles: string[];
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
