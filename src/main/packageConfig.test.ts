import { readFileSync } from "node:fs";
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
    win?: { target?: string[]; signAndEditExecutable?: boolean };
  };
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as PackageJson;
}

describe("package config", () => {
  it("defines desktop packaging scripts and Windows targets", () => {
    const pkg = readPackageJson();

    expect(pkg.devDependencies?.["electron-builder"]).toBeDefined();
    expect(pkg.scripts?.["package:dir"]).toBe("npm run build && electron-builder --dir");
    expect(pkg.scripts?.["dist:win"]).toBe("npm run build && electron-builder --win");
    expect(pkg.build).toMatchObject({
      appId: "dev.forge.app",
      productName: "Forge",
      directories: { output: "release" },
      win: { target: ["nsis", "zip"], signAndEditExecutable: false }
    });
    expect(pkg.build?.files).toContain("out/**/*");
  });
});
