// 本文件说明: 提供对话区和文件预览共用的轻量 Markdown 解析与渲染骨架
import type { ReactElement, ReactNode } from "react";

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "blockquote"; text: string }
  | { kind: "code"; language: string; content: string }
  | { kind: "rule" };

type MarkdownContentProps = {
  compact?: boolean;
  content: string;
  detectLooseCodeBlocks?: boolean;
  renderCodeBlock: (block: Extract<MarkdownBlock, { kind: "code" }>, index: number) => ReactElement;
};

export function MarkdownContent({
  compact = false,
  content,
  detectLooseCodeBlocks = false,
  renderCodeBlock
}: MarkdownContentProps): ReactElement {
  const blocks = parseMarkdownBlocks(content, { detectLooseCodeBlocks });

  return (
    <div
      className={
        compact
          ? "min-h-0 min-w-0 break-words text-sm leading-6 text-[#202123]"
          : "min-h-0 min-w-0 overflow-auto break-words rounded-[14px] border border-[#ececf1] bg-white p-5 text-[14px] leading-7 text-[#202123]"
      }
    >
      <article className={compact ? "min-w-0 space-y-2" : "mx-auto min-w-0 max-w-[860px] space-y-4"}>
        {blocks.map((block, index) => renderMarkdownBlock(block, index, renderCodeBlock))}
      </article>
    </div>
  );
}

function renderMarkdownBlock(
  block: MarkdownBlock,
  index: number,
  renderCodeBlock: (block: Extract<MarkdownBlock, { kind: "code" }>, index: number) => ReactElement
): ReactElement {
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
    return renderCodeBlock(block, index);
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
    <p key={index} className="min-w-0 break-words text-[#343541]">
      {renderInlineMarkdown(block.text)}
    </p>
  );
}

function parseMarkdownBlocks(
  content: string,
  options: { detectLooseCodeBlocks: boolean }
): MarkdownBlock[] {
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

    if (options.detectLooseCodeBlocks && isLooseCodeBlockStart(lines, index)) {
      const codeLines: string[] = [];

      while (index < lines.length) {
        const currentLine = lines[index] ?? "";

        if (!currentLine.trim()) {
          codeLines.push(currentLine);
          index += 1;
          continue;
        }

        if (codeLines.length > 0 && shouldEndLooseCodeBlock(currentLine)) {
          break;
        }

        codeLines.push(currentLine);
        index += 1;
      }

      blocks.push({
        kind: "code",
        language: inferLooseCodeBlockLanguage(codeLines.join("\n")),
        content: codeLines.join("\n").trimEnd()
      });
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;

    while (index < lines.length) {
      const nextLine = (lines[index] ?? "").trim();

      if (
        !nextLine ||
        /^(```|#{1,3}\s+|[-*]\s+|\d+[.)]\s+|>)/.test(nextLine) ||
        isMarkdownTableStart(lines, index)
      ) {
        break;
      }

      paragraphLines.push(nextLine);
      index += 1;
    }

    blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

// 有些模型会把命令输出或完整源码直接吐出来, 这里兜底框进代码预览
function isLooseCodeBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  const trimmed = line.trim();

  if (isLooseCodeLine(trimmed)) {
    return true;
  }

  const nextLines = lines.slice(index, index + 6).map((item) => item.trim()).filter(Boolean);

  return nextLines.length >= 3 && nextLines.filter(isLooseCodeLine).length >= 2;
}

function isLooseCodeLine(line: string): boolean {
  return (
    /^\$[A-Za-z_][\w-]*\s*=/.test(line) ||
    /^#\s/.test(line) ||
    /^["']?\$[A-Za-z_][\w-]*(?:[\\/]|["'])/u.test(line) ||
    /^(?:运行命令\s+)?(?:powershell|pwsh|cmd|npm|pnpm|yarn|mvn|gradle|git|New-Item|Set-Content|Get-Content)\b/iu.test(line) ||
    /^["'][^"']+[\\/][^"']*["']$/u.test(line) ||
    /^@["']/.test(line) ||
    /^["']@$/u.test(line) ||
    /^@[A-Za-z_][\w.]*\b/u.test(line) ||
    /^<\?xml\b/iu.test(line) ||
    /^<\/?[A-Za-z][\w:-]*(?:\s|>|$)/u.test(line) ||
    /^(?:package|import|export|public|private|protected|class|interface|enum|const|let|function|return|from)\b/u.test(line) ||
    /^[{}()[\];]+$/.test(line)
  );
}

function shouldEndLooseCodeBlock(line: string): boolean {
  const trimmed = line.trim();

  if (isLooseCodeLine(trimmed) || /^\s/.test(line)) {
    return false;
  }

  return true;
}

function inferLooseCodeBlockLanguage(content: string): string {
  if (/\b(?:New-Item|Set-Content|Get-Content|powershell|pwsh)\b/iu.test(content)) {
    return "powershell";
  }

  if (/<project\s+xmlns=|<\?xml\b/iu.test(content)) {
    return "xml";
  }

  if (/\b(?:public\s+class|package\s+[\w.]+;|import\s+[\w.]+;)\b/u.test(content)) {
    return "java";
  }

  if (/\b(?:import|export|const|let|function)\b/u.test(content)) {
    return "typescript";
  }

  return "txt";
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  const header = (lines[index] ?? "").trim();
  const separator = (lines[index + 1] ?? "").trim();

  return isMarkdownTableRow(header) && isMarkdownTableSeparator(separator);
}

function isMarkdownTableRow(line: string): boolean {
  return line.includes("|") && splitMarkdownTableRow(line).length >= 2;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);

  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()));
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

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
