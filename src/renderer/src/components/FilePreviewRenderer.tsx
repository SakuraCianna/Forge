// 本文件说明: 渲染代码和 Markdown 文件预览, 代码块使用 Shiki 语法高亮
import { useEffect, useState } from "react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import lightPlusTheme from "shiki/themes/light-plus.mjs";
import type { HighlighterCore, LanguageInput } from "shiki/core";
import type { ReactElement, ReactNode } from "react";
import type { CodeFormatterMode } from "@/state/codeFormatting";

type FilePreviewRendererProps = {
  content: string;
  mode: CodeFormatterMode;
  path: string;
};

type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "blockquote"; text: string }
  | { kind: "code"; language: string; content: string }
  | { kind: "rule" };

type ShikiPreviewLanguage =
  | "bash"
  | "bat"
  | "cmd"
  | "css"
  | "diff"
  | "dockerfile"
  | "dotenv"
  | "git-commit"
  | "html"
  | "javascript"
  | "json"
  | "jsonc"
  | "jsx"
  | "less"
  | "make"
  | "markdown"
  | "mdx"
  | "powershell"
  | "python"
  | "scss"
  | "sql"
  | "text"
  | "tsx"
  | "typescript"
  | "yaml";

type LoadableShikiLanguage = Exclude<ShikiPreviewLanguage, "text">;

type CodeHighlightState =
  | { kind: "fallback" }
  | { kind: "loading" }
  | { html: string; kind: "ready" };

const codePreviewTheme = "light-plus";
const loadedShikiLanguages = new Set<ShikiPreviewLanguage>(["text"]);
const shikiLanguageLoadPromises = new Map<LoadableShikiLanguage, Promise<void>>();

let shikiHighlighterPromise: Promise<HighlighterCore> | null = null;

// 根据预览模式选择 Markdown 渲染或代码渲染
export function FilePreviewRenderer({
  content,
  mode,
  path
}: FilePreviewRendererProps): ReactElement {
  if (mode === "rendered" && isMarkdownPath(path)) {
    return <MarkdownPreview content={content} />;
  }

  return <CodePreview content={content} path={path} />;
}

// 渲染简化 Markdown, 对话输出和文件预览共用
export function MarkdownPreview({
  compact = false,
  content
}: {
  compact?: boolean;
  content: string;
}): ReactElement {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div
      className={
        compact
          ? "min-h-0 text-sm leading-6 text-[#202123]"
          : "min-h-0 overflow-auto rounded-[14px] border border-[#ececf1] bg-white p-5 text-[14px] leading-7 text-[#202123]"
      }
    >
      <article className={compact ? "space-y-2" : "mx-auto max-w-[860px] space-y-4"}>
        {blocks.map((block, index) => renderMarkdownBlock(block, index))}
      </article>
    </div>
  );
}

// 将解析后的 Markdown 块映射成对应 HTML 结构
function renderMarkdownBlock(block: MarkdownBlock, index: number): ReactElement {
  if (block.kind === "heading") {
    const className =
      block.level === 1
        ? "text-[26px] font-semibold leading-9"
        : block.level === 2
          ? "text-[20px] font-semibold leading-8"
          : "text-[16px] font-semibold leading-7";

    if (block.level === 1) {
      return (
        <h1 key={index} className={className}>
          {renderInlineMarkdown(block.text)}
        </h1>
      );
    }

    if (block.level === 2) {
      return (
        <h2 key={index} className={className}>
          {renderInlineMarkdown(block.text)}
        </h2>
      );
    }

    return (
      <h3 key={index} className={className}>
        {renderInlineMarkdown(block.text)}
      </h3>
    );
  }

  if (block.kind === "code") {
    return <CodePreview key={index} content={block.content} path={`preview.${block.language || "txt"}`} compact />;
  }

  if (block.kind === "list") {
    const Tag = block.ordered ? "ol" : "ul";

    return (
      <Tag
        key={index}
        className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
      >
        {block.items.map((item, itemIndex) => (
          <li key={`${index}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </Tag>
    );
  }

  if (block.kind === "table") {
    return (
      <div key={index} className="max-w-full overflow-x-auto rounded-[12px] border border-[#ececf1]">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px] leading-6">
          <thead className="bg-[#f7f7f8] text-[#202123]">
            <tr>
              {block.headers.map((header, headerIndex) => (
                <th
                  key={`${index}-header-${headerIndex}`}
                  scope="col"
                  className="border-b border-[#ececf1] px-3 py-2 font-semibold"
                >
                  {renderInlineMarkdown(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${index}-row-${rowIndex}`} className="border-t border-[#f3f3f6]">
                {block.headers.map((_, cellIndex) => (
                  <td
                    key={`${index}-cell-${rowIndex}-${cellIndex}`}
                    className="align-top px-3 py-2 text-[#343541]"
                  >
                    {renderInlineMarkdown(row[cellIndex] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.kind === "blockquote") {
    return (
      <blockquote key={index} className="border-l-4 border-[#d9d9e3] pl-4 text-[#565869]">
        {renderInlineMarkdown(block.text)}
      </blockquote>
    );
  }

  if (block.kind === "rule") {
    return <hr key={index} className="border-[#ececf1]" />;
  }

  return (
    <p key={index} className="text-[#343541]">
      {renderInlineMarkdown(block.text)}
    </p>
  );
}

// 渲染代码块, 异步切换到 Shiki 生成的编辑器风格高亮 HTML
function CodePreview({
  compact = false,
  content,
  path
}: {
  compact?: boolean;
  content: string;
  path: string;
}): ReactElement {
  const [highlightState, setHighlightState] = useState<CodeHighlightState>({ kind: "loading" });
  const containerClassName = `min-h-0 overflow-auto rounded-[14px] border border-[#ececf1] bg-white font-mono text-[12px] leading-6 text-[#202123] ${
    compact ? "p-3" : "p-4"
  }`;

  useEffect(() => {
    let didCancel = false;

    setHighlightState({ kind: "loading" });
    void renderCodeWithShiki(content, path)
      .then((html) => {
        if (!didCancel) {
          setHighlightState({ html, kind: "ready" });
        }
      })
      .catch(() => {
        if (!didCancel) {
          setHighlightState({ kind: "fallback" });
        }
      });

    return () => {
      didCancel = true;
    };
  }, [content, path]);

  if (highlightState.kind === "ready") {
    return (
      <div
        className={`${containerClassName} shiki-code-preview [&_code]:block [&_code]:font-mono [&_code]:text-[12px] [&_code]:leading-6 [&_pre]:m-0 [&_pre]:min-w-max [&_pre]:!bg-transparent [&_pre]:p-0`}
        dangerouslySetInnerHTML={{ __html: highlightState.html }}
      />
    );
  }

  return (
    <pre
      aria-busy={highlightState.kind === "loading"}
      className={`${containerClassName} whitespace-pre`}
    >
      <code>{content}</code>
    </pre>
  );
}

// 使用 Shiki 统一渲染代码块, 避免维护自定义正则 token 高亮
async function renderCodeWithShiki(content: string, path: string): Promise<string> {
  const language = getCodePreviewLanguage(path);
  const highlighter = await getShikiHighlighter();

  await loadShikiLanguage(highlighter, language);

  return highlighter.codeToHtml(content, {
    lang: language,
    theme: codePreviewTheme
  });
}

function getShikiHighlighter(): Promise<HighlighterCore> {
  if (!shikiHighlighterPromise) {
    shikiHighlighterPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [],
      themes: [lightPlusTheme]
    });
  }

  return shikiHighlighterPromise;
}

async function loadShikiLanguage(
  highlighter: HighlighterCore,
  language: ShikiPreviewLanguage
): Promise<void> {
  if (language === "text" || loadedShikiLanguages.has(language)) {
    return;
  }

  const loadableLanguage: LoadableShikiLanguage = language;
  const languageLoader = shikiLanguageRegistry[loadableLanguage];

  if (!languageLoader) {
    loadedShikiLanguages.add(loadableLanguage);
    return;
  }

  const existingLoader = shikiLanguageLoadPromises.get(loadableLanguage);

  if (existingLoader) {
    await existingLoader;
    return;
  }

  const loader = languageLoader()
    .then((languageRegistration: LanguageInput) => highlighter.loadLanguage(languageRegistration))
    .then(() => {
      loadedShikiLanguages.add(loadableLanguage);
    })
    .finally(() => {
      shikiLanguageLoadPromises.delete(loadableLanguage);
    });

  shikiLanguageLoadPromises.set(loadableLanguage, loader);
  await loader;
}

function getCodePreviewLanguage(path: string): ShikiPreviewLanguage {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  const fileName = normalizedPath.split("/").pop() ?? "";

  if (fileName === "dockerfile") {
    return "dockerfile";
  }

  if (fileName === "makefile") {
    return "make";
  }

  if (fileName.endsWith(".config.ts") || fileName.endsWith(".config.mts")) {
    return "typescript";
  }

  if (fileName.endsWith(".config.js") || fileName.endsWith(".config.mjs")) {
    return "javascript";
  }

  const extension = fileName.match(/\.([^.]+)$/u)?.[1] ?? fileName;

  return shikiLanguageByExtension[extension] ?? "text";
}

const shikiLanguageByExtension: Partial<Record<string, ShikiPreviewLanguage>> = {
  bat: "bat",
  cjs: "javascript",
  cmd: "cmd",
  css: "css",
  diff: "diff",
  env: "dotenv",
  gitignore: "git-commit",
  htm: "html",
  html: "html",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  less: "less",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  mts: "typescript",
  ps1: "powershell",
  py: "python",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  yaml: "yaml",
  yml: "yaml"
};

const shikiLanguageRegistry: Partial<Record<LoadableShikiLanguage, () => Promise<LanguageInput>>> = {
  bash: () => import("shiki/langs/bash.mjs").then((module) => module.default),
  bat: () => import("shiki/langs/bat.mjs").then((module) => module.default),
  cmd: () => import("shiki/langs/cmd.mjs").then((module) => module.default),
  css: () => import("shiki/langs/css.mjs").then((module) => module.default),
  diff: () => import("shiki/langs/diff.mjs").then((module) => module.default),
  dockerfile: () => import("shiki/langs/dockerfile.mjs").then((module) => module.default),
  dotenv: () => import("shiki/langs/dotenv.mjs").then((module) => module.default),
  "git-commit": () => import("shiki/langs/git-commit.mjs").then((module) => module.default),
  html: () => import("shiki/langs/html.mjs").then((module) => module.default),
  javascript: () => import("shiki/langs/javascript.mjs").then((module) => module.default),
  json: () => import("shiki/langs/json.mjs").then((module) => module.default),
  jsonc: () => import("shiki/langs/jsonc.mjs").then((module) => module.default),
  jsx: () => import("shiki/langs/jsx.mjs").then((module) => module.default),
  less: () => import("shiki/langs/less.mjs").then((module) => module.default),
  make: () => import("shiki/langs/make.mjs").then((module) => module.default),
  markdown: () => import("shiki/langs/markdown.mjs").then((module) => module.default),
  mdx: () => import("shiki/langs/mdx.mjs").then((module) => module.default),
  powershell: () => import("shiki/langs/powershell.mjs").then((module) => module.default),
  python: () => import("shiki/langs/python.mjs").then((module) => module.default),
  scss: () => import("shiki/langs/scss.mjs").then((module) => module.default),
  sql: () => import("shiki/langs/sql.mjs").then((module) => module.default),
  tsx: () => import("shiki/langs/tsx.mjs").then((module) => module.default),
  typescript: () => import("shiki/langs/typescript.mjs").then((module) => module.default),
  yaml: () => import("shiki/langs/yaml.mjs").then((module) => module.default)
};

// 用轻量解析器拆分 Markdown 块, 避免引入重型运行时依赖
function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = /^```([A-Za-z0-9_-]*)/.exec(trimmed);

    if (fence) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push({ kind: "code", language: fence[1] || "txt", content: codeLines.join("\n") });
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);

    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2]
      });
      index += 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const tableRows: string[][] = [splitMarkdownTableRow(trimmed)];
      index += 2;

      while (index < lines.length) {
        const row = (lines[index] ?? "").trim();

        if (!isMarkdownTableRow(row)) {
          break;
        }

        tableRows.push(splitMarkdownTableRow(row));
        index += 1;
      }

      blocks.push({
        kind: "table",
        headers: tableRows[0],
        rows: tableRows.slice(1)
      });
      continue;
    }

    if (trimmed.startsWith(">")) {
      blocks.push({ kind: "blockquote", text: trimmed.replace(/^>\s?/, "") });
      index += 1;
      continue;
    }

    if (/^(?:[-*]\s+|\d+[.)]\s+)/.test(trimmed)) {
      const ordered = /^\d+[.)]\s+/.test(trimmed);
      const items: string[] = [];

      while (index < lines.length) {
        const item = (lines[index] ?? "").trim();
        const itemMatch = ordered ? /^\d+[.)]\s+(.+)$/.exec(item) : /^[-*]\s+(.+)$/.exec(item);

        if (!itemMatch) {
          break;
        }

        items.push(itemMatch[1]);
        index += 1;
      }

      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;

    while (index < lines.length) {
      const nextLine = (lines[index] ?? "").trim();

      if (!nextLine || /^(```|#{1,3}\s+|[-*]\s+|\d+[.)]\s+|>)/.test(nextLine) || isMarkdownTableStart(lines, index)) {
        break;
      }

      paragraphLines.push(nextLine);
      index += 1;
    }

    blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

// 判断当前位置是否是 GitHub 风格表格的表头和分隔行
function isMarkdownTableStart(lines: string[], index: number): boolean {
  const header = (lines[index] ?? "").trim();
  const separator = (lines[index + 1] ?? "").trim();

  return isMarkdownTableRow(header) && isMarkdownTableSeparator(separator);
}

// 识别包含至少两列的管道表格行
function isMarkdownTableRow(line: string): boolean {
  return line.includes("|") && splitMarkdownTableRow(line).length >= 2;
}

// 识别 Markdown 表格分隔行, 支持 :--- 和 ---:
function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);

  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()));
}

// 拆分管道表格行并去掉首尾空单元格
function splitMarkdownTableRow(line: string): string[] {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

  return cells;
}

// 渲染行内代码和强调文本, 其他内容保持原样
function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={index} className="rounded-[6px] bg-[#f7f7f8] px-1.5 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

// 根据扩展名判断是否可以渲染 Markdown
function isMarkdownPath(path: string): boolean {
  const normalizedPath = path.toLowerCase();

  return normalizedPath.endsWith(".md") || normalizedPath.endsWith(".mdx");
}
