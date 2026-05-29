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

export function getPrettierParserForPath(path: string): string | null {
  const normalizedPath = path.toLowerCase();
  const extension = Object.keys(parserByExtension)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => normalizedPath.endsWith(candidate));

  return extension ? parserByExtension[extension] : null;
}

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

function unwrapDefault<T>(module: unknown): T {
  return isRecord(module) && "default" in module ? (module.default as T) : (module as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
