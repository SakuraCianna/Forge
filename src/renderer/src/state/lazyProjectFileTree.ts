import type { ProjectDirectoryEntry } from "@shared/fileTypes";
import type { ProjectFileTreeNode } from "./projectFileTree";

export function createProjectFileTreeNodesFromDirectoryEntries(
  entries: ProjectDirectoryEntry[]
): ProjectFileTreeNode[] {
  return entries.map((entry) =>
    entry.kind === "directory"
      ? {
          children: [],
          kind: "directory",
          name: entry.name,
          relativePath: entry.relativePath
        }
      : {
          kind: "file",
          name: entry.name,
          relativePath: entry.relativePath,
          size: entry.size ?? 0
        }
  );
}

export function mergeProjectFileTreeDirectoryEntries(
  nodes: ProjectFileTreeNode[],
  directoryPath: string,
  entries: ProjectDirectoryEntry[]
): ProjectFileTreeNode[] {
  const normalizedDirectoryPath = normalizeLazyDirectoryPath(directoryPath);
  const nextChildren = createProjectFileTreeNodesFromDirectoryEntries(entries);

  if (normalizedDirectoryPath === ".") {
    return nextChildren;
  }

  return nodes.map((node) => {
    if (node.kind !== "directory") {
      return node;
    }

    if (node.relativePath === normalizedDirectoryPath) {
      return {
        ...node,
        children: nextChildren
      };
    }

    if (!normalizedDirectoryPath.startsWith(`${node.relativePath}/`)) {
      return node;
    }

    return {
      ...node,
      children: mergeProjectFileTreeDirectoryEntries(
        node.children,
        normalizedDirectoryPath,
        entries
      )
    };
  });
}

export function normalizeLazyDirectoryPath(relativePath: string): string {
  const normalized = relativePath.trim().replace(/\\/g, "/").replace(/^\.\//u, "").replace(/\/+$/u, "");

  return normalized || ".";
}

export function addUniquePath(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths : [...paths, path];
}

export function removePath(paths: string[], path: string): string[] {
  return paths.filter((candidate) => candidate !== path);
}
