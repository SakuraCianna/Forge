// 本文件说明: 构建项目文件树和文件父级路径, 避免 App 继续堆叠文件树纯逻辑
import type { ProjectFile } from "@shared/projectTypes";

export type ProjectFileTreeNode =
  | {
      children: ProjectFileTreeNode[];
      kind: "directory";
      name: string;
      relativePath: string;
    }
  | {
      kind: "file";
      name: string;
      relativePath: string;
      size: number;
    };

export function buildProjectFileTree(files: ProjectFile[]): ProjectFileTreeNode[] {
  const rootNodes: ProjectFileTreeNode[] = [];

  for (const file of files) {
    const parts = file.relativePath.split("/").filter(Boolean);

    if (parts.length === 0) {
      continue;
    }

    let currentNodes = rootNodes;
    let currentPath = "";

    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (index === parts.length - 1) {
        if (!currentNodes.some((node) => node.kind === "file" && node.relativePath === file.relativePath)) {
          currentNodes.push({
            kind: "file",
            name: part,
            relativePath: file.relativePath,
            size: file.size
          });
        }

        continue;
      }

      let directoryNode = currentNodes.find(
        (node): node is Extract<ProjectFileTreeNode, { kind: "directory" }> =>
          node.kind === "directory" && node.relativePath === currentPath
      );

      if (!directoryNode) {
        directoryNode = {
          children: [],
          kind: "directory",
          name: part,
          relativePath: currentPath
        };
        currentNodes.push(directoryNode);
      }

      currentNodes = directoryNode.children;
    }
  }

  return sortProjectFileTreeNodes(rootNodes);
}

export function getProjectFileParentPaths(relativePath: string): string[] {
  const parts = relativePath.split("/").filter(Boolean);
  const parentPaths: string[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    parentPaths.push(parts.slice(0, index).join("/"));
  }

  return parentPaths;
}

function sortProjectFileTreeNodes(nodes: ProjectFileTreeNode[]): ProjectFileTreeNode[] {
  return nodes
    .map((node) =>
      node.kind === "directory"
        ? {
            ...node,
            children: sortProjectFileTreeNodes(node.children)
          }
        : node
    )
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}
