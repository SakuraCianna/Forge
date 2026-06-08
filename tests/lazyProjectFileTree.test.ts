import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeProjectFileTreeDirectoryEntries,
  removePathAndDescendants,
  removeProjectFileTreePath
} from "../src/renderer/src/state/lazyProjectFileTree.js";
import type { ProjectDirectoryEntry } from "../src/shared/fileTypes.js";

test("removeProjectFileTreePath prunes a deleted directory and its loaded children", () => {
  const rootEntries: ProjectDirectoryEntry[] = [
    { kind: "directory", name: "backend", relativePath: "backend" },
    { kind: "directory", name: "frontend", relativePath: "frontend" }
  ];
  const backendEntries: ProjectDirectoryEntry[] = [
    { kind: "file", name: "pom.xml", relativePath: "backend/pom.xml", size: 128 },
    { kind: "directory", name: "src", relativePath: "backend/src" }
  ];
  const loadedTree = mergeProjectFileTreeDirectoryEntries(
    mergeProjectFileTreeDirectoryEntries([], ".", rootEntries),
    "backend",
    backendEntries
  );

  const prunedTree = removeProjectFileTreePath(loadedTree, "backend");

  assert.deepEqual(
    prunedTree.map((node) => node.relativePath),
    ["frontend"]
  );
});

test("removePathAndDescendants clears folder state for deleted directory descendants", () => {
  assert.deepEqual(
    removePathAndDescendants([".", "backend", "backend/src", "frontend"], "backend"),
    [".", "frontend"]
  );
});
