const recentProjectsStorageKey = "forge.recentProjects";
const maxRecentProjects = 12;

export type ForgeProject = {
  name: string;
  path: string;
  openedAt: string;
  pinned?: boolean;
};

export function createProjectFromPath(path: string, openedAt = new Date().toISOString()): ForgeProject {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const name = normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? normalizedPath;

  return {
    name,
    path: normalizedPath,
    openedAt
  };
}

export function addRecentProject(projects: ForgeProject[], project: ForgeProject): ForgeProject[] {
  const withoutDuplicate = projects.filter((candidate) => candidate.path !== project.path);
  return sortProjects([project, ...withoutDuplicate]).slice(0, maxRecentProjects);
}

export function removeRecentProject(projects: ForgeProject[], projectPath: string): ForgeProject[] {
  return projects.filter((project) => project.path !== projectPath);
}

export function toggleProjectPinned(projects: ForgeProject[], projectPath: string): ForgeProject[] {
  return sortProjects(
    projects.map((project) =>
      project.path === projectPath ? { ...project, pinned: !project.pinned } : project
    )
  );
}

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

export function saveRecentProjects(storage: Storage, projects: ForgeProject[]): void {
  storage.setItem(recentProjectsStorageKey, JSON.stringify(projects));
}

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

function sortProjects(projects: ForgeProject[]): ForgeProject[] {
  return [...projects].sort((left, right) => {
    const pinnedDelta = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));

    if (pinnedDelta !== 0) {
      return pinnedDelta;
    }

    return Date.parse(right.openedAt) - Date.parse(left.openedAt);
  });
}

function isForgeProject(value: unknown): value is ForgeProject {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ForgeProject).name === "string" &&
    typeof (value as ForgeProject).path === "string" &&
    typeof (value as ForgeProject).openedAt === "string"
  );
}

function getParentFolderName(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
  return parts.at(-2) ?? "";
}
