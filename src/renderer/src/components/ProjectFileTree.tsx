// 本文件说明: 渲染项目文件树, 从 App 抽出递归 UI 以降低主文件复杂度
import type { ReactElement } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ProjectFileTreeNode } from "@/state/projectFileTree";
import { ProjectFileIcon } from "./ProjectFileIcon";
import { ProjectFolderIcon } from "./ProjectFolderIcon";

type ProjectFileTreeProps = {
  expandedFolders: ReadonlySet<string>;
  nodes: ProjectFileTreeNode[];
  onPreviewFile: (relativePath: string) => void;
  onToggleFolder: (relativePath: string) => void;
  selectedPath: string | null;
};

export function ProjectFileTree({
  expandedFolders,
  nodes,
  onPreviewFile,
  onToggleFolder,
  selectedPath
}: ProjectFileTreeProps): ReactElement {
  function renderProjectFileTreeNodes(
    treeNodes: ProjectFileTreeNode[],
    depth: number
  ): ReactElement[] {
    return treeNodes.flatMap((node) => {
      const paddingLeft = 8 + depth * 14;

      if (node.kind === "directory") {
        const expanded = expandedFolders.has(node.relativePath);

        return [
          <button
            key={node.relativePath}
            type="button"
            aria-expanded={expanded}
            onClick={() => onToggleFolder(node.relativePath)}
            className="flex w-full items-center gap-1.5 rounded-[10px] py-1.5 pr-2 text-left text-[12px] text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
            style={{ paddingLeft }}
            title={node.relativePath}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <ProjectFolderIcon expanded={expanded} relativePath={node.relativePath} />
            <span className="min-w-0 truncate">{node.name}</span>
          </button>,
          ...(expanded ? renderProjectFileTreeNodes(node.children, depth + 1) : [])
        ];
      }

      const selected = selectedPath === node.relativePath;

      return [
        <button
          key={node.relativePath}
          type="button"
          onClick={() => onPreviewFile(node.relativePath)}
          className={`flex w-full items-center gap-1.5 rounded-[10px] py-1.5 pr-2 text-left text-[12px] ${
            selected
              ? "bg-[#ececf1] text-[#202123]"
              : "text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
          }`}
          style={{ paddingLeft }}
          title={node.relativePath}
        >
          <span className="h-3.5 w-3.5 shrink-0" />
          <ProjectFileIcon relativePath={node.relativePath} />
          <span className="min-w-0 truncate">{node.name}</span>
        </button>
      ];
    });
  }

  return <div className="space-y-0.5">{renderProjectFileTreeNodes(nodes, 0)}</div>;
}
