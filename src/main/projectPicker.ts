// 本文件说明: 主进程 项目选择器
type OpenDialogResult = {
  canceled: boolean;
  filePaths: string[];
};

type ShowOpenDialog = () => Promise<OpenDialogResult>;

export async function pickProjectDirectory(showOpenDialog: ShowOpenDialog): Promise<string | null> {
  const result = await showOpenDialog();

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}
