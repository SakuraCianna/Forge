import type { ProjectDirectoryEntry } from "@shared/fileTypes";
import type { ProjectFileTreeNode } from "./projectFileTree.js";

export function createProjectFileTreeNodesFromDirectoryEntries(
  entries: ProjectDirectoryEntry[]
): ProjectFileTreeNode[] {
  return sortProjectFileTreeNodesForDisplay(
    entries.map((entry) =>
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
    )
  );
}

export function mergeProjectFileTreeDirectoryEntries(
  nodes: ProjectFileTreeNode[],
  directoryPath: string,
  entries: ProjectDirectoryEntry[],
  options: { append?: boolean } = {}
): ProjectFileTreeNode[] {
  const normalizedDirectoryPath = normalizeLazyDirectoryPath(directoryPath);
  const nextChildren = createProjectFileTreeNodesFromDirectoryEntries(entries);

  if (normalizedDirectoryPath === ".") {
    return options.append ? appendProjectFileTreeNodes(nodes, nextChildren) : nextChildren;
  }

  return nodes.map((node) => {
    if (node.kind !== "directory") {
      return node;
    }

    if (node.relativePath === normalizedDirectoryPath) {
      return {
        ...node,
        children: options.append
          ? appendProjectFileTreeNodes(node.children, nextChildren)
          : nextChildren
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
        entries,
        options
      )
    };
  });
}

export function removeProjectFileTreePath(
  nodes: ProjectFileTreeNode[],
  relativePath: string
): ProjectFileTreeNode[] {
  const normalizedRelativePath = normalizeLazyDirectoryPath(relativePath);

  if (normalizedRelativePath === ".") {
    return [];
  }

  return nodes.flatMap((node) => {
    if (isLazyPathAtOrInside(node.relativePath, normalizedRelativePath)) {
      return [];
    }

    if (
      node.kind === "directory" &&
      isLazyPathAtOrInside(normalizedRelativePath, node.relativePath)
    ) {
      return [
        {
          ...node,
          children: removeProjectFileTreePath(node.children, normalizedRelativePath)
        }
      ];
    }

    return [node];
  });
}

// 分页追加时只补新节点, 已经加载过的目录节点保留 children, 避免折叠/展开状态丢失
function appendProjectFileTreeNodes(
  currentNodes: ProjectFileTreeNode[],
  nextNodes: ProjectFileTreeNode[]
): ProjectFileTreeNode[] {
  const nextByPath = new Map(nextNodes.map((node) => [node.relativePath, node]));
  const existingPaths = new Set(currentNodes.map((node) => node.relativePath));
  const mergedNodes = currentNodes.map((currentNode) => {
    const nextNode = nextByPath.get(currentNode.relativePath);

    if (!nextNode) {
      return currentNode;
    }

    if (currentNode.kind === "directory" && nextNode.kind === "directory") {
      return {
        ...nextNode,
        children: currentNode.children
      };
    }

    return nextNode;
  });

  return sortProjectFileTreeNodesForDisplay([
    ...mergedNodes,
    ...nextNodes.filter((node) => !existingPaths.has(node.relativePath))
  ]);
}

function sortProjectFileTreeNodesForDisplay(nodes: ProjectFileTreeNode[]): ProjectFileTreeNode[] {
  return [...nodes].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
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

export function removePathAndDescendants(paths: string[], path: string): string[] {
  const normalizedPath = normalizeLazyDirectoryPath(path);

  return paths.filter((candidate) => !isLazyPathAtOrInside(candidate, normalizedPath));
}

export function isLazyPathAtOrInside(candidatePath: string, parentPath: string): boolean {
  const normalizedCandidatePath = normalizeLazyDirectoryPath(candidatePath);
  const normalizedParentPath = normalizeLazyDirectoryPath(parentPath);

  return (
    normalizedParentPath === "." ||
    normalizedCandidatePath === normalizedParentPath ||
    normalizedCandidatePath.startsWith(`${normalizedParentPath}/`)
  );
}
