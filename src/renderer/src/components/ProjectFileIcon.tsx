// 本文件说明: 渲染项目文件类型图标, 文件树、列表和预览标题共用同一套视觉映射
import type { ReactElement } from "react";
import archiveIconUrl from "@/assets/file-icons/zip.svg";
import astroIconUrl from "@/assets/file-icons/astro.svg";
import audioIconUrl from "@/assets/file-icons/audio.svg";
import cIconUrl from "@/assets/file-icons/c.svg";
import configIconUrl from "@/assets/file-icons/settings.svg";
import cppIconUrl from "@/assets/file-icons/cpp.svg";
import csharpIconUrl from "@/assets/file-icons/csharp.svg";
import cssIconUrl from "@/assets/file-icons/css.svg";
import defaultIconUrl from "@/assets/file-icons/file.svg";
import documentIconUrl from "@/assets/file-icons/document.svg";
import dockerIconUrl from "@/assets/file-icons/docker.svg";
import eslintIconUrl from "@/assets/file-icons/eslint.svg";
import gitIconUrl from "@/assets/file-icons/git.svg";
import goIconUrl from "@/assets/file-icons/go.svg";
import htmlIconUrl from "@/assets/file-icons/html.svg";
import imageIconUrl from "@/assets/file-icons/image.svg";
import javaIconUrl from "@/assets/file-icons/java.svg";
import javascriptIconUrl from "@/assets/file-icons/javascript.svg";
import jsonIconUrl from "@/assets/file-icons/json.svg";
import kotlinIconUrl from "@/assets/file-icons/kotlin.svg";
import lockIconUrl from "@/assets/file-icons/lock.svg";
import luaIconUrl from "@/assets/file-icons/lua.svg";
import markdownIconUrl from "@/assets/file-icons/markdown.svg";
import npmIconUrl from "@/assets/file-icons/npm.svg";
import pdfIconUrl from "@/assets/file-icons/pdf.svg";
import phpIconUrl from "@/assets/file-icons/php.svg";
import postcssIconUrl from "@/assets/file-icons/postcss.svg";
import powerpointIconUrl from "@/assets/file-icons/powerpoint.svg";
import powershellIconUrl from "@/assets/file-icons/powershell.svg";
import pythonIconUrl from "@/assets/file-icons/python.svg";
import reactIconUrl from "@/assets/file-icons/react.svg";
import reactTsIconUrl from "@/assets/file-icons/react_ts.svg";
import rubyIconUrl from "@/assets/file-icons/ruby.svg";
import rustIconUrl from "@/assets/file-icons/rust.svg";
import sassIconUrl from "@/assets/file-icons/sass.svg";
import spreadsheetIconUrl from "@/assets/file-icons/table.svg";
import sqlIconUrl from "@/assets/file-icons/database.svg";
import svelteIconUrl from "@/assets/file-icons/svelte.svg";
import swiftIconUrl from "@/assets/file-icons/swift.svg";
import tailwindIconUrl from "@/assets/file-icons/tailwindcss.svg";
import terminalIconUrl from "@/assets/file-icons/console.svg";
import textIconUrl from "@/assets/file-icons/markdown.svg";
import tomlIconUrl from "@/assets/file-icons/toml.svg";
import typescriptIconUrl from "@/assets/file-icons/typescript.svg";
import videoIconUrl from "@/assets/file-icons/video.svg";
import viteIconUrl from "@/assets/file-icons/vite.svg";
import vueIconUrl from "@/assets/file-icons/vue.svg";
import wordIconUrl from "@/assets/file-icons/word.svg";
import yamlIconUrl from "@/assets/file-icons/yaml.svg";
import { getProjectFileIconKind, type ProjectFileIconKind } from "@/state/projectFileIcons";

type ProjectFileIconProps = {
  className?: string;
  relativePath: string;
};

const ICON_URL_BY_KIND: Record<ProjectFileIconKind, string> = {
  archive: archiveIconUrl,
  astro: astroIconUrl,
  audio: audioIconUrl,
  c: cIconUrl,
  config: configIconUrl,
  cpp: cppIconUrl,
  csharp: csharpIconUrl,
  css: cssIconUrl,
  default: defaultIconUrl,
  docker: dockerIconUrl,
  document: documentIconUrl,
  eslint: eslintIconUrl,
  git: gitIconUrl,
  go: goIconUrl,
  html: htmlIconUrl,
  image: imageIconUrl,
  java: javaIconUrl,
  javascript: javascriptIconUrl,
  json: jsonIconUrl,
  jsx: reactIconUrl,
  kotlin: kotlinIconUrl,
  lock: lockIconUrl,
  lua: luaIconUrl,
  markdown: markdownIconUrl,
  npm: npmIconUrl,
  pdf: pdfIconUrl,
  php: phpIconUrl,
  postcss: postcssIconUrl,
  powerpoint: powerpointIconUrl,
  powershell: powershellIconUrl,
  python: pythonIconUrl,
  ruby: rubyIconUrl,
  rust: rustIconUrl,
  scss: sassIconUrl,
  spreadsheet: spreadsheetIconUrl,
  sql: sqlIconUrl,
  svelte: svelteIconUrl,
  swift: swiftIconUrl,
  tailwind: tailwindIconUrl,
  terminal: terminalIconUrl,
  text: textIconUrl,
  toml: tomlIconUrl,
  tsx: reactTsIconUrl,
  typescript: typescriptIconUrl,
  video: videoIconUrl,
  vite: viteIconUrl,
  vue: vueIconUrl,
  word: wordIconUrl,
  yaml: yamlIconUrl
};

export function ProjectFileIcon({
  className = "h-3.5 w-3.5 shrink-0",
  relativePath
}: ProjectFileIconProps): ReactElement {
  const kind = getProjectFileIconKind(relativePath);
  const iconUrl = ICON_URL_BY_KIND[kind];

  return (
    <img
      aria-hidden="true"
      className={`${className} object-contain`}
      draggable={false}
      src={iconUrl}
      alt=""
    />
  );
}
