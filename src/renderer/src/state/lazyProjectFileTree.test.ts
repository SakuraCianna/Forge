import { describe, expect, it } from "vitest";
import {
  addUniquePath,
  mergeProjectFileTreeDirectoryEntries,
  normalizeLazyDirectoryPath,
  removePath
} from "./lazyProjectFileTree";
import type { ProjectFileTreeNode } from "./projectFileTree";

describe("lazy project file tree", () => {
  it("replaces root nodes with directory list entries", () => {
    const tree = mergeProjectFileTreeDirectoryEntries([], ".", [
      { kind: "directory", name: "src", relativePath: "src" },
      { kind: "file", name: "README.md", relativePath: "README.md", size: 30 }
    ]);

    expect(tree).toEqual([
      { kind: "directory", name: "src", relativePath: "src", children: [] },
      { kind: "file", name: "README.md", relativePath: "README.md", size: 30 }
    ]);
  });

  it("merges children into the expanded directory without touching siblings", () => {
    const root: ProjectFileTreeNode[] = [
      { kind: "directory", name: "src", relativePath: "src", children: [] },
      { kind: "directory", name: "docs", relativePath: "docs", children: [] }
    ];

    const tree = mergeProjectFileTreeDirectoryEntries(root, "src", [
      { kind: "file", name: "App.tsx", relativePath: "src/App.tsx", size: 120 }
    ]);

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "src",
        relativePath: "src",
        children: [{ kind: "file", name: "App.tsx", relativePath: "src/App.tsx", size: 120 }]
      },
      { kind: "directory", name: "docs", relativePath: "docs", children: [] }
    ]);
  });

  it("appends directory pages while preserving already loaded children", () => {
    const root: ProjectFileTreeNode[] = [
      {
        kind: "directory",
        name: "src",
        relativePath: "src",
        children: [{ kind: "file", name: "App.tsx", relativePath: "src/App.tsx", size: 120 }]
      }
    ];

    const tree = mergeProjectFileTreeDirectoryEntries(
      root,
      ".",
      [
        { kind: "directory", name: "src", relativePath: "src" },
        { kind: "file", name: "README.md", relativePath: "README.md", size: 30 }
      ],
      { append: true }
    );

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "src",
        relativePath: "src",
        children: [{ kind: "file", name: "App.tsx", relativePath: "src/App.tsx", size: 120 }]
      },
      { kind: "file", name: "README.md", relativePath: "README.md", size: 30 }
    ]);
  });

  it("appends child directory pages without replacing the previous page", () => {
    const root: ProjectFileTreeNode[] = [
      {
        kind: "directory",
        name: "src",
        relativePath: "src",
        children: [{ kind: "file", name: "App.tsx", relativePath: "src/App.tsx", size: 120 }]
      }
    ];

    const tree = mergeProjectFileTreeDirectoryEntries(
      root,
      "src",
      [{ kind: "file", name: "main.tsx", relativePath: "src/main.tsx", size: 80 }],
      { append: true }
    );

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "src",
        relativePath: "src",
        children: [
          { kind: "file", name: "App.tsx", relativePath: "src/App.tsx", size: 120 },
          { kind: "file", name: "main.tsx", relativePath: "src/main.tsx", size: 80 }
        ]
      }
    ]);
  });

  it("normalizes folder paths and keeps path sets stable", () => {
    expect(normalizeLazyDirectoryPath("./frontend/src/")).toBe("frontend/src");
    expect(normalizeLazyDirectoryPath("")).toBe(".");
    expect(addUniquePath(["src"], "src")).toEqual(["src"]);
    expect(addUniquePath(["src"], "docs")).toEqual(["src", "docs"]);
    expect(removePath(["src", "docs"], "src")).toEqual(["docs"]);
  });
});
