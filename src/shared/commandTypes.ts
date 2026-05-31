// 本文件说明: 定义命令输出分片和运行结果的共享类型
type CommandOutputStream = "stdout" | "stderr";

export type CommandOutputChunk = {
  runId?: string;
  command: string;
  stream: CommandOutputStream;
  chunk: string;
};
