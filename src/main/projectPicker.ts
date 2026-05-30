// 本文件说明: 通过系统目录选择器获取用户授权的项目路径
type OpenDialogResult = {
  canceled: boolean;
  filePaths: string[];
};

type ShowOpenDialog = () => Promise<OpenDialogResult>;

// 打开目录选择框并返回第一个被用户选中的路径
export async function pickProjectDirectory(showOpenDialog: ShowOpenDialog): Promise<string | null> {
  const result = await showOpenDialog();

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}
