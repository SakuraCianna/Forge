// 本文件说明: 共享模块 命令共享类型
export type CommandOutputStream = "stdout" | "stderr";

export type CommandOutputChunk = {
  runId?: string;
  command: string;
  stream: CommandOutputStream;
  chunk: string;
};
