import test from "node:test";
import assert from "node:assert/strict";
import {
  makeUniqueProjectName,
  reduceProjectWorkspace,
  selectInitialProjectFromPreferences,
  type ProjectWorkspaceState
} from "../src/renderer/src/state/projectWorkspace.js";
import {
  createDefaultGeneralPreferences,
  saveGeneralPreferences
} from "../src/renderer/src/state/generalPreferences.js";
import type { ForgeProject } from "../src/renderer/src/state/projects.js";

test("project workspace initialization can start blank when preferences request it", () => {
  const storage = new MemoryStorage();
  saveGeneralPreferences(storage, {
    ...createDefaultGeneralPreferences(),
    defaultOpenTarget: "blank"
  });

  assert.equal(selectInitialProjectFromPreferences([project("Demo")], storage), null);
  assert.equal(selectInitialProjectFromPreferences([project("Demo")], null)?.path, "E:\\CodeHome\\Demo");
});

test("project workspace selection refreshes recents and clears missing state", () => {
  const state = reduceProjectWorkspace(
    {
      currentProject: null,
      missingProjectPath: "E:\\CodeHome\\Demo",
      recentProjects: [
        project("Demo", "2026-06-16T00:00:00.000Z"),
        project("Other", "2026-06-17T00:00:00.000Z")
      ]
    },
    {
      now: () => "2026-06-18T00:00:00.000Z",
      projectPath: "E:\\CodeHome\\Demo",
      type: "select"
    }
  );

  assert.equal(state.currentProject?.path, "E:\\CodeHome\\Demo");
  assert.equal(state.missingProjectPath, null);
  assert.equal(state.recentProjects[0]?.path, "E:\\CodeHome\\Demo");
  assert.equal(state.recentProjects[0]?.openedAt, "2026-06-18T00:00:00.000Z");
});

test("project workspace removal clears the active project only when the active path is removed", () => {
  const initialState: ProjectWorkspaceState = {
    currentProject: project("Demo"),
    missingProjectPath: "E:\\CodeHome\\Demo",
    recentProjects: [project("Demo"), project("Other")]
  };
  const removedOther = reduceProjectWorkspace(initialState, {
    projectPath: "E:\\CodeHome\\Other",
    type: "remove"
  });
  const removedActive = reduceProjectWorkspace(initialState, {
    projectPath: "E:\\CodeHome\\Demo",
    type: "remove"
  });

  assert.equal(removedOther.currentProject?.path, "E:\\CodeHome\\Demo");
  assert.equal(removedOther.missingProjectPath, "E:\\CodeHome\\Demo");
  assert.equal(removedActive.currentProject, null);
  assert.equal(removedActive.missingProjectPath, null);
});

test("project workspace renaming keeps display names unique and updates active project", () => {
  const state = reduceProjectWorkspace(
    {
      currentProject: project("Demo"),
      missingProjectPath: null,
      recentProjects: [project("Demo"), project("Other")]
    },
    {
      name: "Other",
      projectPath: "E:\\CodeHome\\Demo",
      type: "rename"
    }
  );

  assert.equal(state.currentProject?.name, "Other 2");
  assert.equal(
    state.recentProjects.find((item: ForgeProject) => item.path === "E:\\CodeHome\\Demo")?.name,
    "Other 2"
  );
});

test("project workspace name uniquing ignores the project being renamed", () => {
  assert.equal(
    makeUniqueProjectName(
      "Demo",
      [project("Demo"), project("Demo 2", "2026-06-17T00:00:00.000Z")],
      "E:\\CodeHome\\Demo"
    ),
    "Demo"
  );
  assert.equal(
    makeUniqueProjectName(
      "Demo",
      [project("Demo"), project("Demo 2", "2026-06-17T00:00:00.000Z")],
      "E:\\CodeHome\\Other"
    ),
    "Demo 3"
  );
});

function project(name: string, openedAt = "2026-06-16T00:00:00.000Z"): ForgeProject {
  return {
    name,
    openedAt,
    path: `E:\\CodeHome\\${name}`
  };
}

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}
