// 本文件说明: 用测试守住源码中文注释的基本质量
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const codeEntryPoints = ["electron.vite.config.ts", "vitest.config.ts", "eslint.config.js", "src"];
const codeExtensions = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs"]);
const forbiddenChinesePunctuation = /[，。；：！？]/;

// 收集需要检查注释的代码文件
function collectCodeFiles(targetPath: string): string[] {
  const absolutePath = path.join(repositoryRoot, targetPath);
  const stats = statSync(absolutePath);

  if (stats.isFile()) {
    return codeExtensions.has(path.extname(absolutePath)) ? [absolutePath] : [];
  }

  return readdirSync(absolutePath).flatMap((entry) => {
    const relativePath = path.join(targetPath, entry);

    return collectCodeFiles(relativePath);
  });
}

// 读取文件开头的中文说明注释
function readLeadingChineseComment(filePath: string): string | undefined {
  const source = readFileSync(filePath, "utf8");

  return source
    .split(/\r?\n/)
    .slice(0, 8)
    .map((line) => line.trim())
    .find((line) => /^\/\/\s*[\u4e00-\u9fff]/.test(line));
}

// 判断注释是否符合中文说明规则
function isValidChineseComment(comment: string | undefined): boolean {
  return Boolean(comment) && !forbiddenChinesePunctuation.test(comment ?? "") && !comment?.endsWith(".");
}

// 收集需要方法级注释的声明节点
function collectDocumentableFunctions(filePath: string): Array<{ line: number; name: string }> {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const results: Array<{ line: number; name: string }> = [];

  // 把缺少中文说明的节点记录成行号, 方便失败时定位到具体声明
  function addNode(node: ts.Node, fallbackName: string): void {
    if (hasLeadingChineseComment(source, node.getFullStart())) {
      return;
    }

    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

    results.push({ line: line + 1, name: fallbackName });
  }

  // 遍历 TypeScript AST 中可读性最需要说明的声明节点
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addNode(node, node.name.text);
    } else if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
      addNode(node, ts.isConstructorDeclaration(node) ? "constructor" : node.name.getText(sourceFile));
    } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      addNode(node, node.name.getText(sourceFile));
    } else if (ts.isVariableStatement(node)) {
      const hasFunctionInitializer = node.declarationList.declarations.some(
        (declaration) =>
          declaration.name.kind === ts.SyntaxKind.Identifier &&
          declaration.initializer !== undefined &&
          (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      );

      if (hasFunctionInitializer) {
        addNode(node, node.declarationList.declarations[0]?.name.getText(sourceFile) ?? "anonymous");
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return results;
}

// 检查节点前面是否已经有中文说明注释
function hasLeadingChineseComment(source: string, position: number): boolean {
  const commentRanges = ts.getLeadingCommentRanges(source, position) ?? [];
  const lastComment = commentRanges.at(-1);

  if (!lastComment) {
    return false;
  }

  const comment = source.slice(lastComment.pos, lastComment.end).trim();

  return isValidChineseComment(comment) && /[\u4e00-\u9fff]/.test(comment);
}

describe("source comment policy", () => {
  const codeFiles = codeEntryPoints.flatMap(collectCodeFiles);

  it.each(codeFiles)("keeps a Chinese file summary comment in %s", (filePath) => {
    const comment = readLeadingChineseComment(filePath);

    expect(isValidChineseComment(comment)).toBe(true);
  });

  it.each(codeFiles)("keeps Chinese comments before documentable functions in %s", (filePath) => {
    const missingComments = collectDocumentableFunctions(filePath);

    expect(missingComments).toEqual([]);
  });
});
