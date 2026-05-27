import { describe, expect, it } from "vitest";
import {
  addRecentProject,
  createProjectFromPath,
  loadRecentProjects,
  saveRecentProjects
} from "./projects";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("projects", () => {
  it("creates a project record from a Windows path", () => {
    expect(createProjectFromPath("E:\\CodeHome\\Forge", "2026-05-27T13:00:00.000Z")).toEqual({
      name: "Forge",
      path: "E:\\CodeHome\\Forge",
      openedAt: "2026-05-27T13:00:00.000Z"
    });
  });

  it("deduplicates and moves reopened projects to the top", () => {
    const first = createProjectFromPath("E:\\CodeHome\\Forge", "2026-05-27T13:00:00.000Z");
    const second = createProjectFromPath("E:\\CodeHome\\Aiko", "2026-05-27T14:00:00.000Z");
    const reopened = createProjectFromPath("E:\\CodeHome\\Forge", "2026-05-27T15:00:00.000Z");

    const projects = addRecentProject(addRecentProject(addRecentProject([], first), second), reopened);

    expect(projects.map((project) => project.path)).toEqual([
      "E:\\CodeHome\\Forge",
      "E:\\CodeHome\\Aiko"
    ]);
    expect(projects[0].openedAt).toBe("2026-05-27T15:00:00.000Z");
  });

  it("persists recent projects", () => {
    const storage = createMemoryStorage();
    const project = createProjectFromPath("E:\\CodeHome\\Forge", "2026-05-27T13:00:00.000Z");

    saveRecentProjects(storage, [project]);

    expect(loadRecentProjects(storage)).toEqual([project]);
  });
});
