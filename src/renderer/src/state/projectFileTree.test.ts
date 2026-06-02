import { describe, expect, it } from "vitest";
import { buildProjectFileTree, getProjectFileParentPaths } from "./projectFileTree";

describe("project file tree", () => {
  it("builds sorted directory-first project file trees and ignores duplicate files", () => {
    const tree = buildProjectFileTree([
      { relativePath: "src/App.tsx", size: 120 },
      { relativePath: "README.md", size: 30 },
      { relativePath: "src/components/Button.tsx", size: 80 },
      { relativePath: "src/App.tsx", size: 120 },
      { relativePath: "", size: 1 }
    ]);

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "src",
        relativePath: "src",
        children: [
          {
            kind: "directory",
            name: "components",
            relativePath: "src/components",
            children: [
              {
                kind: "file",
                name: "Button.tsx",
                relativePath: "src/components/Button.tsx",
                size: 80
              }
            ]
          },
          {
            kind: "file",
            name: "App.tsx",
            relativePath: "src/App.tsx",
            size: 120
          }
        ]
      },
      {
        kind: "file",
        name: "README.md",
        relativePath: "README.md",
        size: 30
      }
    ]);
  });

  it("returns all parent folder paths for auto-expanding selected files", () => {
    expect(getProjectFileParentPaths("frontend/src/components/App.tsx")).toEqual([
      "frontend",
      "frontend/src",
      "frontend/src/components"
    ]);
    expect(getProjectFileParentPaths("README.md")).toEqual([]);
  });
});
