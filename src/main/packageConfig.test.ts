// 本文件说明: 确认 Electron 和 Vite 配置指向正确的构建产物
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  build?: {
    appId?: string;
    productName?: string;
    directories?: { output?: string };
    files?: string[];
    win?: { icon?: string; target?: string[]; signAndEditExecutable?: boolean };
  };
};

// 读取 package.json 作为普通对象, 让配置断言不依赖导入缓存
function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as PackageJson;
}

describe("package config", () => {
  it("does not expose release packaging while Forge is not release-ready", () => {
    const pkg = readPackageJson();

    expect(pkg.devDependencies?.["electron-builder"]).toBeUndefined();
    expect(pkg.scripts?.["package:dir"]).toBeUndefined();
    expect(pkg.scripts?.["dist:win"]).toBeUndefined();
    expect(pkg.build).toBeUndefined();
  });

  it("does not keep release documentation or automation in the repository", () => {
    expect(existsSync(join(process.cwd(), "docs", "RELEASE.md"))).toBe(false);
    expect(existsSync(join(process.cwd(), ".github", "workflows", "release.yml"))).toBe(false);
  });

  it("loads the ESM preload bundle emitted by electron-vite", () => {
    const mainSource = readFileSync(join(process.cwd(), "src", "main", "index.ts"), "utf8");

    expect(mainSource).toContain("../preload/index.mjs");
  });
});
