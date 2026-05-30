// 本文件说明: 维护最近项目列表, 置顶排序和本地展示名
const recentProjectsStorageKey = "forge.recentProjects";
const maxRecentProjects = 12;

export type ForgeProject = {
  name: string;
  path: string;
  openedAt: string;
  pinned?: boolean;
};

// 从本地路径创建项目记录, 展示名优先取文件夹名称
export function createProjectFromPath(path: string, openedAt = new Date().toISOString()): ForgeProject {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const name = normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? normalizedPath;

  return {
    name,
    path: normalizedPath,
    openedAt
  };
}

// 添加或刷新最近项目, 已存在项目只更新时间和名称
export function addRecentProject(projects: ForgeProject[], project: ForgeProject): ForgeProject[] {
  const withoutDuplicate = projects.filter((candidate) => candidate.path !== project.path);
  return sortProjects([project, ...withoutDuplicate]).slice(0, maxRecentProjects);
}

// 从最近项目里移除路径, 不删除磁盘上的真实项目
export function removeRecentProject(projects: ForgeProject[], projectPath: string): ForgeProject[] {
  return projects.filter((project) => project.path !== projectPath);
}

// 切换项目置顶状态后重新排序
export function toggleProjectPinned(projects: ForgeProject[], projectPath: string): ForgeProject[] {
  return sortProjects(
    projects.map((project) =>
      project.path === projectPath ? { ...project, pinned: !project.pinned } : project
    )
  );
}

// 路径缺少文件夹名时返回兜底名称
export function getProjectDisplayName(project: ForgeProject, projects: ForgeProject[]): string {
  const duplicateNames = projects.filter(
    (candidate) => candidate.name.toLowerCase() === project.name.toLowerCase()
  );

  if (duplicateNames.length <= 1) {
    return project.name;
  }

  const parentName = getParentFolderName(project.path);
  const candidateName = parentName ? `${project.name} (${parentName})` : project.name;
  const matchingCandidateCount = duplicateNames.filter(
    (candidate) => `${candidate.name} (${getParentFolderName(candidate.path)})` === candidateName
  ).length;

  return matchingCandidateCount > 1 ? `${project.name} (${project.path})` : candidateName;
}

// 保存最近项目列表, 侧边栏刷新后继续恢复
export function saveRecentProjects(storage: Storage, projects: ForgeProject[]): void {
  storage.setItem(recentProjectsStorageKey, JSON.stringify(projects));
}

// 从 localStorage 读取最近项目, 无效数据直接忽略
export function loadRecentProjects(storage: Storage): ForgeProject[] {
  const rawValue = storage.getItem(recentProjectsStorageKey);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as ForgeProject[];
    return Array.isArray(parsed) ? parsed.filter(isForgeProject) : [];
  } catch {
      return [];
  }
}

// 置顶项目排前面, 其余项目按最近打开时间排序
function sortProjects(projects: ForgeProject[]): ForgeProject[] {
  return [...projects].sort((left, right) => {
    const pinnedDelta = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));

    if (pinnedDelta !== 0) {
      return pinnedDelta;
    }

    return Date.parse(right.openedAt) - Date.parse(left.openedAt);
  });
}

// 校验持久化项目记录, 防止坏数据进入侧边栏
function isForgeProject(value: unknown): value is ForgeProject {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ForgeProject).name === "string" &&
    typeof (value as ForgeProject).path === "string" &&
    typeof (value as ForgeProject).openedAt === "string"
  );
}

// 从路径中读取最后一级文件夹名
function getParentFolderName(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
  return parts.at(-2) ?? "";
}
