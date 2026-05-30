// 本文件说明: 渲染代码和 Markdown 文件预览, 支持轻量语法高亮
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
  | { kind: "blockquote"; text: string }
  | { kind: "code"; language: string; content: string }
  | { kind: "rule" };

const keywordPattern =
  /^(?:abstract|async|await|break|case|catch|class|const|continue|default|do|else|enum|export|extends|finally|for|from|function|if|import|in|interface|let|new|of|return|switch|throw|try|type|var|while|with|yield)$/;

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

// 渲染代码块并按行做轻量高亮
function CodePreview({
  compact = false,
  content,
  path
}: {
  compact?: boolean;
  content: string;
  path: string;
}): ReactElement {
  const lines = content.split("\n");

  return (
    <pre
      className={`min-h-0 overflow-auto whitespace-pre rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] font-mono text-[12px] leading-6 text-[#202123] ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <code>
        {lines.map((line, index) => (
          <span key={`${path}-${index}`} className="block min-h-6">
            {highlightCodeLine(line)}
          </span>
        ))}
      </code>
    </pre>
  );
}

// 将一行代码拆成 token, 保持高亮简单且可控
function highlightCodeLine(line: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const tokenPattern =
    /(\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b|[{}()[\].,:;])/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(line)) !== null) {
    if (match.index > cursor) {
      tokens.push(line.slice(cursor, match.index));
    }

    const token = match[0];
    tokens.push(
      <span key={`${match.index}-${token}`} className={getCodeTokenClassName(token)}>
        {token}
      </span>
    );
    cursor = match.index + token.length;
  }

  if (cursor < line.length) {
    tokens.push(line.slice(cursor));
  }

  return tokens.length > 0 ? tokens : [line];
}

// 根据 token 类型返回高亮 className
function getCodeTokenClassName(token: string): string {
  if (token.startsWith("//") || token.startsWith("/*")) {
    return "text-[#6e6e80]";
  }

  if (/^["'`]/.test(token)) {
    return "text-[#047857]";
  }

  if (/^\d/.test(token) || token === "true" || token === "false" || token === "null") {
    return "text-[#b45309]";
  }

  if (keywordPattern.test(token)) {
    return "text-[#8b5cf6]";
  }

  if (/^[{}()[\].,:;]$/.test(token)) {
    return "text-[#6e6e80]";
  }

  return "text-[#202123]";
}

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

      if (!nextLine || /^(```|#{1,3}\s+|[-*]\s+|\d+[.)]\s+|>)/.test(nextLine)) {
        break;
      }

      paragraphLines.push(nextLine);
      index += 1;
    }

    blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
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
