// 本文件说明: 渲染代码和 Markdown 文件预览, 代码块使用 Shiki 语法高亮
import { useEffect, useState } from "react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import lightPlusTheme from "shiki/themes/light-plus.mjs";
import type { HighlighterCore, LanguageInput } from "shiki/core";
import type { ReactElement, ReactNode } from "react";
import type { CodeFormatterMode } from "@/state/codeFormatting";
import type { ProjectFilePreview } from "@shared/fileTypes";

type FilePreviewRendererProps = {
  content: string;
  filePreview?: ProjectFilePreview | null;
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

type ShikiPreviewLanguage = string;
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
  filePreview,
  mode,
  path
}: FilePreviewRendererProps): ReactElement {
  if (filePreview && filePreview.kind !== "text") {
    return <InlineFilePreview preview={filePreview} />;
  }

  if (mode === "rendered" && isMarkdownPath(path)) {
    return <MarkdownPreview content={content} />;
  }

  return <CodePreview content={content} path={path} />;
}

function InlineFilePreview({ preview }: { preview: Exclude<ProjectFilePreview, { kind: "text" }> }): ReactElement {
  if (preview.kind === "image") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-auto rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] p-4">
        <img
          alt={preview.relativePath}
          src={preview.dataUrl}
          className="max-h-full max-w-full rounded-[10px] object-contain shadow-sm"
        />
      </div>
    );
  }

  if (preview.kind === "pdf") {
    return (
      <iframe
        title={preview.relativePath}
        src={preview.dataUrl}
        className="h-full min-h-0 w-full rounded-[14px] border border-[#ececf1] bg-white"
      />
    );
  }

  if (preview.kind === "audio") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] p-6">
        <div className="w-full max-w-[720px] space-y-3">
          <audio controls src={preview.dataUrl} className="w-full" />
          <FileMetaLine preview={preview} />
        </div>
      </div>
    );
  }

  if (preview.kind === "video") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[14px] border border-[#ececf1] bg-[#111827] p-4">
        <video controls src={preview.dataUrl} className="max-h-full max-w-full rounded-[10px]" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] p-6 text-center">
      <div className="max-w-[520px] space-y-3">
        <p className="text-[15px] font-semibold text-[#202123]">
          {preview.kind === "office" ? "文档预览暂不可用" : "暂不支持预览"}
        </p>
        <p className="break-all text-[12px] leading-6 text-[#6e6e80]">
          {preview.relativePath}
        </p>
        <FileMetaLine preview={preview} />
      </div>
    </div>
  );
}

function FileMetaLine({ preview }: { preview: Exclude<ProjectFilePreview, { kind: "text" }> }): ReactElement {
  return (
    <p className="text-[12px] text-[#8e8ea0]">
      {preview.mediaType} · {formatFileSize(preview.size)}
    </p>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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
  const specialFileLanguage = shikiLanguageByFileName[fileName];

  if (specialFileLanguage) {
    return specialFileLanguage;
  }

  if (fileName === ".env" || fileName.startsWith(".env.") || fileName.endsWith(".env")) {
    return "dotenv";
  }

  if (fileName === "dockerfile" || fileName.startsWith("dockerfile.")) {
    return "dockerfile";
  }

  if (fileName === "makefile" || fileName.startsWith("makefile.")) {
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

const shikiLanguageByFileName: Partial<Record<string, ShikiPreviewLanguage>> = {
  ".babelrc": "jsonc",
  ".dockerignore": "git-commit",
  ".editorconfig": "properties",
  ".gitattributes": "git-commit",
  ".gitignore": "git-commit",
  ".npmrc": "properties",
  ".prettierrc": "jsonc",
  ".stylelintrc": "jsonc",
  "cmakelists.txt": "cmake",
  codeowners: "codeowners",
  "compose.yaml": "yaml",
  "compose.yml": "yaml",
  "docker-compose.yaml": "yaml",
  "docker-compose.yml": "yaml",
  justfile: "just",
  makefile: "make",
  "package-lock.json": "json",
  "pnpm-lock.yaml": "yaml",
  "yarn.lock": "yaml"
};

const shikiLanguageByExtension: Partial<Record<string, ShikiPreviewLanguage>> = {
  "1c": "1c",
  adoc: "asciidoc",
  apache: "apache",
  applescript: "applescript",
  asciidoc: "asciidoc",
  asm: "asm",
  astro: "astro",
  awk: "awk",
  bash: "bash",
  bat: "bat",
  bib: "bibtex",
  bibtex: "bibtex",
  bicep: "bicep",
  blade: "blade",
  c: "c",
  "c#": "csharp",
  "c++": "cpp",
  cc: "cpp",
  cjs: "javascript",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  clojure: "clojure",
  cmake: "cmake",
  cmd: "cmd",
  coffee: "coffee",
  coffeescript: "coffee",
  conf: "ini",
  cpp: "cpp",
  cr: "crystal",
  crystal: "crystal",
  cs: "csharp",
  csharp: "csharp",
  css: "css",
  csv: "csv",
  cts: "typescript",
  cxx: "cpp",
  d: "d",
  dart: "dart",
  diff: "diff",
  docker: "dockerfile",
  dockerfile: "dockerfile",
  eex: "elixir",
  elm: "elm",
  elixir: "elixir",
  env: "dotenv",
  erb: "erb",
  erl: "erlang",
  erlang: "erlang",
  ex: "elixir",
  exs: "elixir",
  f: "fortran-free-form",
  "f#": "fsharp",
  f03: "fortran-free-form",
  f08: "fortran-free-form",
  f18: "fortran-free-form",
  f77: "fortran-fixed-form",
  f90: "fortran-free-form",
  f95: "fortran-free-form",
  fish: "fish",
  frag: "glsl",
  fs: "fsharp",
  fsi: "fsharp",
  fsx: "fsharp",
  fsharp: "fsharp",
  gd: "gdscript",
  gdshader: "gdshader",
  gitignore: "git-commit",
  gleam: "gleam",
  glsl: "glsl",
  gn: "gn",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  groovy: "groovy",
  h: "c",
  haml: "haml",
  handlebars: "handlebars",
  hbs: "handlebars",
  hcl: "hcl",
  hh: "cpp",
  hpp: "cpp",
  hs: "haskell",
  haskell: "haskell",
  htm: "html",
  html: "html",
  hxx: "cpp",
  ini: "ini",
  java: "java",
  javascript: "javascript",
  jl: "julia",
  js: "javascript",
  json: "json",
  json5: "json5",
  jsonc: "jsonc",
  jsonl: "jsonl",
  jsonnet: "jsonnet",
  jsx: "jsx",
  just: "just",
  kdl: "kdl",
  kt: "kotlin",
  kts: "kotlin",
  kotlin: "kotlin",
  latex: "latex",
  lean: "lean",
  lean4: "lean4",
  less: "less",
  liquid: "liquid",
  lisp: "lisp",
  ll: "llvm",
  log: "log",
  lua: "lua",
  luau: "luau",
  m: "objective-c",
  make: "make",
  markdown: "markdown",
  matlab: "matlab",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  mk: "make",
  ml: "ocaml",
  mli: "ocaml",
  mm: "objective-cpp",
  mmd: "mermaid",
  mermaid: "mermaid",
  "objective-c": "objective-c",
  "objective-cpp": "objective-cpp",
  objectivec: "objective-c",
  mojo: "mojo",
  mts: "typescript",
  mustache: "handlebars",
  nim: "nim",
  nix: "nix",
  nu: "nushell",
  p6: "raku",
  pas: "pascal",
  pascal: "pascal",
  patch: "diff",
  perl: "perl",
  php: "php",
  pkl: "pkl",
  pl: "perl",
  plsql: "plsql",
  pm: "perl",
  prisma: "prisma",
  pro: "prolog",
  prolog: "prolog",
  proto: "protobuf",
  protobuf: "protobuf",
  ps: "powershell",
  ps1: "powershell",
  psd1: "powershell",
  psm1: "powershell",
  powershell: "powershell",
  pug: "pug",
  purs: "purescript",
  purescript: "purescript",
  py: "python",
  python: "python",
  pyw: "python",
  qml: "qml",
  r: "r",
  racket: "racket",
  rake: "ruby",
  raku: "raku",
  rb: "ruby",
  reg: "reg",
  regex: "regexp",
  rst: "rst",
  rs: "rust",
  ruby: "ruby",
  rust: "rust",
  sass: "sass",
  scala: "scala",
  scheme: "scheme",
  scss: "scss",
  sh: "bash",
  shader: "shaderlab",
  shell: "bash",
  shellscript: "bash",
  sol: "solidity",
  solidity: "solidity",
  sql: "sql",
  sv: "system-verilog",
  svh: "system-verilog",
  styl: "stylus",
  stylus: "stylus",
  svelte: "svelte",
  swift: "swift",
  systemd: "systemd",
  tcl: "tcl",
  templ: "templ",
  tex: "latex",
  tf: "terraform",
  tfvars: "terraform",
  terraform: "terraform",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  twig: "twig",
  txt: "text",
  plain: "text",
  plaintext: "text",
  typ: "typst",
  typescript: "typescript",
  v: "verilog",
  vala: "vala",
  vb: "vb",
  vert: "glsl",
  vh: "verilog",
  vhd: "vhdl",
  vhdl: "vhdl",
  vim: "viml",
  vue: "vue",
  wasm: "wasm",
  wgsl: "wgsl",
  xml: "xml",
  xsl: "xsl",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
  zsh: "zsh"
};

const shikiLanguageRegistry: Partial<Record<LoadableShikiLanguage, () => Promise<LanguageInput>>> = {
  "1c": () => import("shiki/langs/1c.mjs").then((module) => module.default),
  apache: () => import("shiki/langs/apache.mjs").then((module) => module.default),
  applescript: () => import("shiki/langs/applescript.mjs").then((module) => module.default),
  asciidoc: () => import("shiki/langs/asciidoc.mjs").then((module) => module.default),
  asm: () => import("shiki/langs/asm.mjs").then((module) => module.default),
  astro: () => import("shiki/langs/astro.mjs").then((module) => module.default),
  awk: () => import("shiki/langs/awk.mjs").then((module) => module.default),
  bash: () => import("shiki/langs/bash.mjs").then((module) => module.default),
  bat: () => import("shiki/langs/bat.mjs").then((module) => module.default),
  bibtex: () => import("shiki/langs/bibtex.mjs").then((module) => module.default),
  bicep: () => import("shiki/langs/bicep.mjs").then((module) => module.default),
  blade: () => import("shiki/langs/blade.mjs").then((module) => module.default),
  c: () => import("shiki/langs/c.mjs").then((module) => module.default),
  clojure: () => import("shiki/langs/clojure.mjs").then((module) => module.default),
  cmake: () => import("shiki/langs/cmake.mjs").then((module) => module.default),
  cmd: () => import("shiki/langs/cmd.mjs").then((module) => module.default),
  codeowners: () => import("shiki/langs/codeowners.mjs").then((module) => module.default),
  coffee: () => import("shiki/langs/coffee.mjs").then((module) => module.default),
  cpp: () => import("shiki/langs/cpp.mjs").then((module) => module.default),
  crystal: () => import("shiki/langs/crystal.mjs").then((module) => module.default),
  csharp: () => import("shiki/langs/csharp.mjs").then((module) => module.default),
  css: () => import("shiki/langs/css.mjs").then((module) => module.default),
  csv: () => import("shiki/langs/csv.mjs").then((module) => module.default),
  d: () => import("shiki/langs/d.mjs").then((module) => module.default),
  dart: () => import("shiki/langs/dart.mjs").then((module) => module.default),
  diff: () => import("shiki/langs/diff.mjs").then((module) => module.default),
  dockerfile: () => import("shiki/langs/dockerfile.mjs").then((module) => module.default),
  dotenv: () => import("shiki/langs/dotenv.mjs").then((module) => module.default),
  elixir: () => import("shiki/langs/elixir.mjs").then((module) => module.default),
  elm: () => import("shiki/langs/elm.mjs").then((module) => module.default),
  erb: () => import("shiki/langs/erb.mjs").then((module) => module.default),
  erlang: () => import("shiki/langs/erlang.mjs").then((module) => module.default),
  fish: () => import("shiki/langs/fish.mjs").then((module) => module.default),
  "fortran-fixed-form": () =>
    import("shiki/langs/fortran-fixed-form.mjs").then((module) => module.default),
  "fortran-free-form": () =>
    import("shiki/langs/fortran-free-form.mjs").then((module) => module.default),
  fsharp: () => import("shiki/langs/fsharp.mjs").then((module) => module.default),
  gdscript: () => import("shiki/langs/gdscript.mjs").then((module) => module.default),
  gdshader: () => import("shiki/langs/gdshader.mjs").then((module) => module.default),
  "git-commit": () => import("shiki/langs/git-commit.mjs").then((module) => module.default),
  gleam: () => import("shiki/langs/gleam.mjs").then((module) => module.default),
  glsl: () => import("shiki/langs/glsl.mjs").then((module) => module.default),
  gn: () => import("shiki/langs/gn.mjs").then((module) => module.default),
  go: () => import("shiki/langs/go.mjs").then((module) => module.default),
  graphql: () => import("shiki/langs/graphql.mjs").then((module) => module.default),
  groovy: () => import("shiki/langs/groovy.mjs").then((module) => module.default),
  haml: () => import("shiki/langs/haml.mjs").then((module) => module.default),
  handlebars: () => import("shiki/langs/handlebars.mjs").then((module) => module.default),
  haskell: () => import("shiki/langs/haskell.mjs").then((module) => module.default),
  hcl: () => import("shiki/langs/hcl.mjs").then((module) => module.default),
  html: () => import("shiki/langs/html.mjs").then((module) => module.default),
  ini: () => import("shiki/langs/ini.mjs").then((module) => module.default),
  java: () => import("shiki/langs/java.mjs").then((module) => module.default),
  javascript: () => import("shiki/langs/javascript.mjs").then((module) => module.default),
  json: () => import("shiki/langs/json.mjs").then((module) => module.default),
  json5: () => import("shiki/langs/json5.mjs").then((module) => module.default),
  jsonc: () => import("shiki/langs/jsonc.mjs").then((module) => module.default),
  jsonl: () => import("shiki/langs/jsonl.mjs").then((module) => module.default),
  jsonnet: () => import("shiki/langs/jsonnet.mjs").then((module) => module.default),
  jsx: () => import("shiki/langs/jsx.mjs").then((module) => module.default),
  julia: () => import("shiki/langs/julia.mjs").then((module) => module.default),
  just: () => import("shiki/langs/just.mjs").then((module) => module.default),
  kdl: () => import("shiki/langs/kdl.mjs").then((module) => module.default),
  kotlin: () => import("shiki/langs/kotlin.mjs").then((module) => module.default),
  latex: () => import("shiki/langs/latex.mjs").then((module) => module.default),
  lean: () => import("shiki/langs/lean.mjs").then((module) => module.default),
  lean4: () => import("shiki/langs/lean4.mjs").then((module) => module.default),
  less: () => import("shiki/langs/less.mjs").then((module) => module.default),
  liquid: () => import("shiki/langs/liquid.mjs").then((module) => module.default),
  lisp: () => import("shiki/langs/lisp.mjs").then((module) => module.default),
  llvm: () => import("shiki/langs/llvm.mjs").then((module) => module.default),
  log: () => import("shiki/langs/log.mjs").then((module) => module.default),
  lua: () => import("shiki/langs/lua.mjs").then((module) => module.default),
  luau: () => import("shiki/langs/luau.mjs").then((module) => module.default),
  make: () => import("shiki/langs/make.mjs").then((module) => module.default),
  markdown: () => import("shiki/langs/markdown.mjs").then((module) => module.default),
  matlab: () => import("shiki/langs/matlab.mjs").then((module) => module.default),
  mdx: () => import("shiki/langs/mdx.mjs").then((module) => module.default),
  mermaid: () => import("shiki/langs/mermaid.mjs").then((module) => module.default),
  mojo: () => import("shiki/langs/mojo.mjs").then((module) => module.default),
  nim: () => import("shiki/langs/nim.mjs").then((module) => module.default),
  nix: () => import("shiki/langs/nix.mjs").then((module) => module.default),
  nushell: () => import("shiki/langs/nushell.mjs").then((module) => module.default),
  "objective-c": () => import("shiki/langs/objective-c.mjs").then((module) => module.default),
  "objective-cpp": () => import("shiki/langs/objective-cpp.mjs").then((module) => module.default),
  ocaml: () => import("shiki/langs/ocaml.mjs").then((module) => module.default),
  pascal: () => import("shiki/langs/pascal.mjs").then((module) => module.default),
  perl: () => import("shiki/langs/perl.mjs").then((module) => module.default),
  php: () => import("shiki/langs/php.mjs").then((module) => module.default),
  pkl: () => import("shiki/langs/pkl.mjs").then((module) => module.default),
  plsql: () => import("shiki/langs/plsql.mjs").then((module) => module.default),
  powershell: () => import("shiki/langs/powershell.mjs").then((module) => module.default),
  prisma: () => import("shiki/langs/prisma.mjs").then((module) => module.default),
  prolog: () => import("shiki/langs/prolog.mjs").then((module) => module.default),
  properties: () => import("shiki/langs/properties.mjs").then((module) => module.default),
  protobuf: () => import("shiki/langs/protobuf.mjs").then((module) => module.default),
  pug: () => import("shiki/langs/pug.mjs").then((module) => module.default),
  purescript: () => import("shiki/langs/purescript.mjs").then((module) => module.default),
  python: () => import("shiki/langs/python.mjs").then((module) => module.default),
  qml: () => import("shiki/langs/qml.mjs").then((module) => module.default),
  r: () => import("shiki/langs/r.mjs").then((module) => module.default),
  racket: () => import("shiki/langs/racket.mjs").then((module) => module.default),
  raku: () => import("shiki/langs/raku.mjs").then((module) => module.default),
  reg: () => import("shiki/langs/reg.mjs").then((module) => module.default),
  regexp: () => import("shiki/langs/regexp.mjs").then((module) => module.default),
  rst: () => import("shiki/langs/rst.mjs").then((module) => module.default),
  ruby: () => import("shiki/langs/ruby.mjs").then((module) => module.default),
  rust: () => import("shiki/langs/rust.mjs").then((module) => module.default),
  sass: () => import("shiki/langs/sass.mjs").then((module) => module.default),
  scala: () => import("shiki/langs/scala.mjs").then((module) => module.default),
  scheme: () => import("shiki/langs/scheme.mjs").then((module) => module.default),
  scss: () => import("shiki/langs/scss.mjs").then((module) => module.default),
  shaderlab: () => import("shiki/langs/shaderlab.mjs").then((module) => module.default),
  solidity: () => import("shiki/langs/solidity.mjs").then((module) => module.default),
  sql: () => import("shiki/langs/sql.mjs").then((module) => module.default),
  stylus: () => import("shiki/langs/stylus.mjs").then((module) => module.default),
  svelte: () => import("shiki/langs/svelte.mjs").then((module) => module.default),
  swift: () => import("shiki/langs/swift.mjs").then((module) => module.default),
  "system-verilog": () => import("shiki/langs/system-verilog.mjs").then((module) => module.default),
  systemd: () => import("shiki/langs/systemd.mjs").then((module) => module.default),
  tcl: () => import("shiki/langs/tcl.mjs").then((module) => module.default),
  templ: () => import("shiki/langs/templ.mjs").then((module) => module.default),
  terraform: () => import("shiki/langs/terraform.mjs").then((module) => module.default),
  toml: () => import("shiki/langs/toml.mjs").then((module) => module.default),
  tsx: () => import("shiki/langs/tsx.mjs").then((module) => module.default),
  twig: () => import("shiki/langs/twig.mjs").then((module) => module.default),
  typescript: () => import("shiki/langs/typescript.mjs").then((module) => module.default),
  typst: () => import("shiki/langs/typst.mjs").then((module) => module.default),
  vala: () => import("shiki/langs/vala.mjs").then((module) => module.default),
  vb: () => import("shiki/langs/vb.mjs").then((module) => module.default),
  verilog: () => import("shiki/langs/verilog.mjs").then((module) => module.default),
  vhdl: () => import("shiki/langs/vhdl.mjs").then((module) => module.default),
  viml: () => import("shiki/langs/viml.mjs").then((module) => module.default),
  vue: () => import("shiki/langs/vue.mjs").then((module) => module.default),
  wasm: () => import("shiki/langs/wasm.mjs").then((module) => module.default),
  wgsl: () => import("shiki/langs/wgsl.mjs").then((module) => module.default),
  xml: () => import("shiki/langs/xml.mjs").then((module) => module.default),
  xsl: () => import("shiki/langs/xsl.mjs").then((module) => module.default),
  yaml: () => import("shiki/langs/yaml.mjs").then((module) => module.default),
  zig: () => import("shiki/langs/zig.mjs").then((module) => module.default),
  zsh: () => import("shiki/langs/zsh.mjs").then((module) => module.default)
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
