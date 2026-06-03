// 本文件说明: 渲染项目文件树, 从 App 抽出递归 UI 以降低主文件复杂度
import type { ReactElement } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ProjectFileTreeNode } from "@/state/projectFileTree";
import { ProjectFileIcon } from "./ProjectFileIcon";
import { ProjectFolderIcon } from "./ProjectFolderIcon";

type ProjectFileTreeProps = {
  expandedFolders: ReadonlySet<string>;
  hasMoreFolders?: ReadonlySet<string>;
  loadingFolders?: ReadonlySet<string>;
  loadMoreLabel?: string;
  loadingLabel?: string;
  nodes: ProjectFileTreeNode[];
  onLoadMoreFolder?: (relativePath: string) => void;
  onPreviewFile: (relativePath: string) => void;
  onToggleFolder: (relativePath: string) => void;
  selectedPath: string | null;
  truncatedFolders?: ReadonlySet<string>;
  truncatedLabel?: string;
};

export function ProjectFileTree({
  expandedFolders,
  hasMoreFolders = new Set(),
  loadingFolders = new Set(),
  loadMoreLabel = "Load more",
  loadingLabel = "Loading...",
  nodes,
  onLoadMoreFolder,
  onPreviewFile,
  onToggleFolder,
  selectedPath,
  truncatedFolders = new Set(),
  truncatedLabel = "Result truncated"
}: ProjectFileTreeProps): ReactElement {
  function renderProjectFileTreeNodes(
    treeNodes: ProjectFileTreeNode[],
    depth: number
  ): ReactElement[] {
    return treeNodes.flatMap((node) => {
      const paddingLeft = 8 + depth * 14;

      if (node.kind === "directory") {
        const expanded = expandedFolders.has(node.relativePath);
        const directoryChildren = expanded ? renderProjectFileTreeNodes(node.children, depth + 1) : [];
        const hasMore = hasMoreFolders.has(node.relativePath);
        const loading = loadingFolders.has(node.relativePath);
        const statusRows =
          expanded && (loading || hasMore || truncatedFolders.has(node.relativePath))
            ? [
                <div
                  key={`${node.relativePath}:status`}
                  className="truncate py-1 pr-2 text-[11px] text-[#8e8ea0]"
                  style={{ paddingLeft: 8 + (depth + 1) * 14 + 28 }}
                >
                  {loading ? (
                    loadingLabel
                  ) : hasMore && onLoadMoreFolder ? (
                    <button
                      type="button"
                      className="rounded-[8px] px-1.5 py-0.5 text-left text-[#2563eb] hover:bg-[#eff6ff]"
                      onClick={() => onLoadMoreFolder(node.relativePath)}
                    >
                      {loadMoreLabel}
                    </button>
                  ) : (
                    truncatedLabel
                  )}
                </div>
              ]
            : [];

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
          ...directoryChildren,
          ...statusRows
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
