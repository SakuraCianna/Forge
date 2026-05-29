export type CommandOutputStream = "stdout" | "stderr";

export type CommandOutputChunk = {
  runId?: string;
  command: string;
  stream: CommandOutputStream;
  chunk: string;
};
