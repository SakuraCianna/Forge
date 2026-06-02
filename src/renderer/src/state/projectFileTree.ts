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

type MutableProjectDirectoryNode = {
  childDirectories: Map<string, MutableProjectDirectoryNode>;
  children: MutableProjectFileTreeNode[];
  kind: "directory";
  name: string;
  relativePath: string;
};

type MutableProjectFileTreeNode = MutableProjectDirectoryNode | Extract<ProjectFileTreeNode, { kind: "file" }>;

export function buildProjectFileTree(files: ProjectFile[]): ProjectFileTreeNode[] {
  const rootDirectory = createMutableDirectoryNode("", "");
  const seenFilePaths = new Set<string>();

  // Build with per-directory maps so large projects do not repeatedly scan sibling nodes.
  for (const file of files) {
    const parts = file.relativePath.split("/").filter(Boolean);

    if (parts.length === 0 || seenFilePaths.has(file.relativePath)) {
      continue;
    }

    seenFilePaths.add(file.relativePath);

    let currentDirectory = rootDirectory;
    let currentPath = "";

    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (index === parts.length - 1) {
        currentDirectory.children.push({
          kind: "file",
          name: part,
          relativePath: file.relativePath,
          size: file.size
        });
        continue;
      }

      let directoryNode = currentDirectory.childDirectories.get(currentPath);

      if (!directoryNode) {
        directoryNode = createMutableDirectoryNode(part, currentPath);
        currentDirectory.childDirectories.set(currentPath, directoryNode);
        currentDirectory.children.push(directoryNode);
      }

      currentDirectory = directoryNode;
    }
  }

  return sortProjectFileTreeNodes(rootDirectory.children);
}

export function getProjectFileParentPaths(relativePath: string): string[] {
  const parts = relativePath.split("/").filter(Boolean);
  const parentPaths: string[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    parentPaths.push(parts.slice(0, index).join("/"));
  }

  return parentPaths;
}

function createMutableDirectoryNode(name: string, relativePath: string): MutableProjectDirectoryNode {
  return {
    childDirectories: new Map(),
    children: [],
    kind: "directory",
    name,
    relativePath
  };
}

function sortProjectFileTreeNodes(nodes: MutableProjectFileTreeNode[]): ProjectFileTreeNode[] {
  return nodes
    .map((node) =>
      node.kind === "directory"
        ? {
            children: sortProjectFileTreeNodes(node.children),
            kind: node.kind,
            name: node.name,
            relativePath: node.relativePath
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
