const recentProjectsStorageKey = "forge.recentProjects";
const maxRecentProjects = 12;

export type ForgeProject = {
  name: string;
  path: string;
  openedAt: string;
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
  return [project, ...withoutDuplicate].slice(0, maxRecentProjects);
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

function isForgeProject(value: unknown): value is ForgeProject {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ForgeProject).name === "string" &&
    typeof (value as ForgeProject).path === "string" &&
    typeof (value as ForgeProject).openedAt === "string"
  );
}
