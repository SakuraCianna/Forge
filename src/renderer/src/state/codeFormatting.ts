// 本文件说明: 为文件预览选择可用格式化方式并懒加载 Prettier
import type { Options, Plugin } from "prettier";

export type CodeFormatterMode = "raw" | "prettier" | "rendered";

export type CodeFormatResult = {
  content: string;
  message?: string;
  status: "raw" | "formatted" | "unsupported" | "error";
};

type PrettierStandalone = {
  format: (source: string, options: Options) => Promise<string> | string;
};

const parserByExtension: Record<string, string> = {
  ".cjs": "babel",
  ".css": "css",
  ".cts": "typescript",
  ".html": "html",
  ".js": "babel",
  ".json": "json",
  ".jsx": "babel",
  ".less": "less",
  ".md": "markdown",
  ".mdx": "markdown",
  ".mjs": "babel",
  ".mts": "typescript",
  ".scss": "scss",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".vue": "html",
  ".yaml": "yaml",
  ".yml": "yaml"
};

// 根据文件扩展名选择 Prettier parser, 不支持的文件保持原始预览
export function getPrettierParserForPath(path: string): string | null {
  const normalizedPath = path.toLowerCase();
  const extension = Object.keys(parserByExtension)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => normalizedPath.endsWith(candidate));

  return extension ? parserByExtension[extension] : null;
}

// 返回当前文件可用的预览模式, 单一模式时前端会禁用下拉
export function getAvailableCodeFormatterModes(path: string): CodeFormatterMode[] {
  const modes: CodeFormatterMode[] = [];

  if (getPrettierParserForPath(path)) {
    modes.push("prettier");
  }

  if (isMarkdownPath(path)) {
    modes.push("rendered");
  }

  return modes;
}

// 支持 Prettier 的文件默认格式化, 其他文件直接原始显示
export function getDefaultCodeFormatterMode(path: string): CodeFormatterMode {
  return getAvailableCodeFormatterModes(path)[0] ?? "raw";
}

// 按用户选择格式化预览内容, 格式化失败时返回中文错误
export async function formatCodePreview(
  path: string,
  content: string,
  mode: CodeFormatterMode
): Promise<CodeFormatResult> {
  if (mode === "raw" || mode === "rendered") {
    return { status: "raw", content };
  }

  const parser = getPrettierParserForPath(path);

  if (!parser) {
    return {
      status: "unsupported",
      content,
      message: "No formatter is configured for this file type."
    };
  }

  try {
    const { prettier, plugins } = await loadPrettier();
    const formatted = await prettier.format(content, {
      parser,
      plugins,
      printWidth: 100
    });

    return { status: "formatted", content: formatted };
  } catch (error) {
    return {
      status: "error",
      content,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

// 懒加载 Prettier 和插件, 避免首次打开文件页拖慢主界面
async function loadPrettier(): Promise<{ prettier: PrettierStandalone; plugins: Plugin[] }> {
  const [standalone, babel, estree, typescript, html, postcss, markdown, yaml] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/html"),
    import("prettier/plugins/postcss"),
    import("prettier/plugins/markdown"),
    import("prettier/plugins/yaml")
  ]);

  return {
    prettier: unwrapDefault<PrettierStandalone>(standalone),
    plugins: [babel, estree, typescript, html, postcss, markdown, yaml].map((plugin) =>
      unwrapDefault<Plugin>(plugin)
    )
  };
}

// 兼容 ESM 默认导出和具名对象两种打包结果
function unwrapDefault<T>(module: unknown): T {
  return isRecord(module) && "default" in module ? (module.default as T) : (module as T);
}

// 将 unknown 缩窄成对象, 用于读取动态导入结果
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 根据扩展名判断是否走 Markdown parser
function isMarkdownPath(path: string): boolean {
  const normalizedPath = path.toLowerCase();

  return normalizedPath.endsWith(".md") || normalizedPath.endsWith(".mdx");
}
