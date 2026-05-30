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
    asar?: boolean;
    files?: string[];
    win?: { icon?: string; target?: string[]; signAndEditExecutable?: boolean };
    nsis?: { oneClick?: boolean; allowToChangeInstallationDirectory?: boolean };
  };
};

// 读取 package.json 作为普通对象, 让配置断言不依赖导入缓存
function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as PackageJson;
}

describe("package config", () => {
  it("exposes a local release packaging flow for Windows builds", () => {
    const pkg = readPackageJson();

    expect(pkg.devDependencies?.["electron-builder"]).toBeDefined();
    expect(pkg.scripts?.["release:check"]).toBe("npm run lint && npm test && npm run build");
    expect(pkg.scripts?.["package:dir"]).toBeUndefined();
    expect(pkg.scripts?.["dist:win"]).toBe(
      "npm run build && electron-builder --win --x64 --publish never"
    );
    expect(pkg.build).toMatchObject({
      appId: "com.sakuracianna.forge",
      productName: "Forge",
      directories: {
        output: "release",
        buildResources: "build"
      },
      asar: true,
      files: ["out/**/*", "package.json"],
      win: {
        icon: "build/icon.ico",
        target: ["nsis"],
        signAndEditExecutable: false
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true
      }
    });
  });

  it("keeps release documentation local and avoids publishing automation by default", () => {
    expect(existsSync(join(process.cwd(), "docs", "RELEASE.md"))).toBe(true);
    expect(existsSync(join(process.cwd(), ".github", "workflows", "release.yml"))).toBe(false);
  });

  it("loads the ESM preload bundle emitted by electron-vite", () => {
    const mainSource = readFileSync(join(process.cwd(), "src", "main", "index.ts"), "utf8");

    expect(mainSource).toContain("../preload/index.mjs");
  });
});
