// 本文件说明: 管理渲染层项目工作区状态, 让 App.tsx 不再内联最近项目和当前项目状态机
import { useCallback, useEffect, useReducer } from "react";
import { loadGeneralPreferences } from "./generalPreferences.js";
import {
  addRecentProject,
  loadRecentProjects,
  removeRecentProject,
  saveRecentProjects,
  toggleProjectPinned,
  type ForgeProject
} from "./projects.js";

export type ProjectWorkspaceState = {
  currentProject: ForgeProject | null;
  missingProjectPath: string | null;
  recentProjects: ForgeProject[];
};

type ProjectWorkspaceSetState<T> = T | ((current: T) => T);

type ProjectWorkspaceAction =
  | { type: "add"; project: ForgeProject }
  | { type: "remove"; projectPath: string }
  | { type: "rename"; name: string; projectPath: string }
  | { type: "select"; now?: () => string; projectPath: string }
  | { type: "setCurrentProject"; value: ProjectWorkspaceSetState<ForgeProject | null> }
  | { type: "setMissingProjectPath"; value: ProjectWorkspaceSetState<string | null> }
  | { type: "setRecentProjects"; value: ProjectWorkspaceSetState<ForgeProject[]> }
  | { type: "togglePinned"; projectPath: string };

export type ProjectWorkspaceApi = ProjectWorkspaceState & {
  addProject: (project: ForgeProject) => void;
  removeProject: (projectPath: string) => void;
  renameProject: (projectPath: string, name: string) => void;
  selectProject: (projectPath: string, options?: { now?: () => string }) => ForgeProject | null;
  setCurrentProject: (value: ProjectWorkspaceSetState<ForgeProject | null>) => void;
  setMissingProjectPath: (value: ProjectWorkspaceSetState<string | null>) => void;
  setRecentProjects: (value: ProjectWorkspaceSetState<ForgeProject[]>) => void;
  togglePinnedProject: (projectPath: string) => void;
};

export function createInitialProjectWorkspaceState(
  recentProjects: ForgeProject[],
  storage: Storage | null
): ProjectWorkspaceState {
  return {
    currentProject: selectInitialProjectFromPreferences(recentProjects, storage),
    missingProjectPath: null,
    recentProjects
  };
}

export function selectInitialProjectFromPreferences(
  projects: ForgeProject[],
  storage: Storage | null
): ForgeProject | null {
  if (!storage) {
    return projects[0] ?? null;
  }

  const preferences = loadGeneralPreferences(storage);

  return preferences.defaultOpenTarget === "blank" ? null : (projects[0] ?? null);
}

export function reduceProjectWorkspace(
  state: ProjectWorkspaceState,
  action: ProjectWorkspaceAction
): ProjectWorkspaceState {
  switch (action.type) {
    case "add":
      return {
        currentProject: action.project,
        missingProjectPath: null,
        recentProjects: addRecentProject(state.recentProjects, action.project)
      };
    case "remove": {
      const recentProjects = removeRecentProject(state.recentProjects, action.projectPath);

      if (state.currentProject?.path !== action.projectPath) {
        return {
          ...state,
          recentProjects
        };
      }

      return {
        currentProject: null,
        missingProjectPath: null,
        recentProjects
      };
    }
    case "rename": {
      const nextName = action.name.trim();

      if (!nextName || !state.recentProjects.some((project) => project.path === action.projectPath)) {
        return state;
      }

      const normalizedName = makeUniqueProjectName(nextName, state.recentProjects, action.projectPath);
      const renameProject = (project: ForgeProject): ForgeProject =>
        project.path === action.projectPath ? { ...project, name: normalizedName } : project;

      return {
        ...state,
        currentProject: state.currentProject ? renameProject(state.currentProject) : null,
        recentProjects: state.recentProjects.map(renameProject)
      };
    }
    case "select": {
      const project = state.recentProjects.find((candidate) => candidate.path === action.projectPath);

      if (!project) {
        return state;
      }

      const selectedProject = {
        ...project,
        openedAt: action.now?.() ?? new Date().toISOString()
      };

      return {
        currentProject: selectedProject,
        missingProjectPath: null,
        recentProjects: addRecentProject(state.recentProjects, selectedProject)
      };
    }
    case "setCurrentProject":
      return {
        ...state,
        currentProject: applyProjectWorkspaceSetState(state.currentProject, action.value)
      };
    case "setMissingProjectPath":
      return {
        ...state,
        missingProjectPath: applyProjectWorkspaceSetState(state.missingProjectPath, action.value)
      };
    case "setRecentProjects":
      return {
        ...state,
        recentProjects: applyProjectWorkspaceSetState(state.recentProjects, action.value)
      };
    case "togglePinned": {
      const recentProjects = toggleProjectPinned(state.recentProjects, action.projectPath);
      const updatedProject = recentProjects.find((project: ForgeProject) => project.path === action.projectPath);

      return {
        ...state,
        currentProject:
          updatedProject && state.currentProject?.path === action.projectPath
            ? updatedProject
            : state.currentProject,
        recentProjects
      };
    }
  }
}

export function useProjectWorkspace(storage: Storage | null): ProjectWorkspaceApi {
  const [state, dispatch] = useReducer(
    reduceProjectWorkspace,
    storage,
    (initialStorage) =>
      createInitialProjectWorkspaceState(
        initialStorage ? loadRecentProjects(initialStorage) : [],
        initialStorage
      )
  );

  useEffect(() => {
    if (storage) {
      saveRecentProjects(storage, state.recentProjects);
    }
  }, [state.recentProjects, storage]);

  const addProject = useCallback((project: ForgeProject): void => {
    dispatch({ project, type: "add" });
  }, []);
  const removeProject = useCallback((projectPath: string): void => {
    dispatch({ projectPath, type: "remove" });
  }, []);
  const renameProject = useCallback((projectPath: string, name: string): void => {
    dispatch({ name, projectPath, type: "rename" });
  }, []);
  const selectProject = useCallback(
    (projectPath: string, options: { now?: () => string } = {}): ForgeProject | null => {
      const project = state.recentProjects.find((candidate) => candidate.path === projectPath);

      if (!project) {
        return null;
      }

      const selectedProject = {
        ...project,
        openedAt: options.now?.() ?? new Date().toISOString()
      };

      dispatch({ now: () => selectedProject.openedAt, projectPath, type: "select" });
      return selectedProject;
    },
    [state.recentProjects]
  );
  const setCurrentProject = useCallback((value: ProjectWorkspaceSetState<ForgeProject | null>): void => {
    dispatch({ type: "setCurrentProject", value });
  }, []);
  const setMissingProjectPath = useCallback((value: ProjectWorkspaceSetState<string | null>): void => {
    dispatch({ type: "setMissingProjectPath", value });
  }, []);
  const setRecentProjects = useCallback((value: ProjectWorkspaceSetState<ForgeProject[]>): void => {
    dispatch({ type: "setRecentProjects", value });
  }, []);
  const togglePinnedProject = useCallback((projectPath: string): void => {
    dispatch({ projectPath, type: "togglePinned" });
  }, []);

  return {
    ...state,
    addProject,
    removeProject,
    renameProject,
    selectProject,
    setCurrentProject,
    setMissingProjectPath,
    setRecentProjects,
    togglePinnedProject
  };
}

// 重复项目名加序号, 侧边栏展示时保持可区分
export function makeUniqueProjectName(name: string, projects: ForgeProject[], projectPath: string): string {
  const existing = new Set(
    projects
      .filter((project) => project.path !== projectPath)
      .map((project) => project.name.trim().toLowerCase())
  );

  if (!existing.has(name.toLowerCase())) {
    return name;
  }

  let suffix = 2;
  let candidate = `${name} ${suffix}`;

  while (existing.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${name} ${suffix}`;
  }

  return candidate;
}

function applyProjectWorkspaceSetState<T>(current: T, value: ProjectWorkspaceSetState<T>): T {
  return typeof value === "function" ? (value as (currentValue: T) => T)(current) : value;
}
