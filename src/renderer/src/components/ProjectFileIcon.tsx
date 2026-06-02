// 本文件说明: 渲染项目文件类型图标, 文件树、列表和预览标题共用同一套视觉映射
import type { ReactElement } from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileBraces,
  FileCode,
  FileCog,
  FileImage,
  FileLock,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideoCamera,
  type LucideIcon
} from "lucide-react";
import { getProjectFileIconKind, type ProjectFileIconKind } from "@/state/projectFileIcons";

type ProjectFileIconProps = {
  className?: string;
  relativePath: string;
};

const ICON_BY_KIND: Record<ProjectFileIconKind, LucideIcon> = {
  archive: FileArchive,
  audio: FileAudio,
  code: FileCode,
  config: FileCog,
  default: File,
  document: FileType,
  image: FileImage,
  json: FileBraces,
  lock: FileLock,
  pdf: FileText,
  spreadsheet: FileSpreadsheet,
  terminal: FileTerminal,
  text: FileText,
  video: FileVideoCamera
};

const TONE_BY_KIND: Record<ProjectFileIconKind, string> = {
  archive: "text-[#a16207]",
  audio: "text-[#7c3aed]",
  code: "text-[#2563eb]",
  config: "text-[#64748b]",
  default: "text-[#6e6e80]",
  document: "text-[#4f46e5]",
  image: "text-[#16a34a]",
  json: "text-[#9333ea]",
  lock: "text-[#b45309]",
  pdf: "text-[#dc2626]",
  spreadsheet: "text-[#059669]",
  terminal: "text-[#0f766e]",
  text: "text-[#565869]",
  video: "text-[#db2777]"
};

export function ProjectFileIcon({
  className = "h-3.5 w-3.5 shrink-0",
  relativePath
}: ProjectFileIconProps): ReactElement {
  const kind = getProjectFileIconKind(relativePath);
  const Icon = ICON_BY_KIND[kind];

  return <Icon aria-hidden="true" className={`${className} ${TONE_BY_KIND[kind]}`} />;
}
