import { describe, expect, it } from "vitest";
import { getProjectFileIconKind } from "./projectFileIcons";

describe("project file icons", () => {
  it("maps common source and config files to semantic icon kinds", () => {
    expect(getProjectFileIconKind("src/App.tsx")).toBe("tsx");
    expect(getProjectFileIconKind("backend/main.py")).toBe("python");
    expect(getProjectFileIconKind("src/main.ts")).toBe("typescript");
    expect(getProjectFileIconKind("src/Button.jsx")).toBe("jsx");
    expect(getProjectFileIconKind("src/App.vue")).toBe("vue");
    expect(getProjectFileIconKind("src/styles.scss")).toBe("scss");
    expect(getProjectFileIconKind("package.json")).toBe("npm");
    expect(getProjectFileIconKind("vite.config.js")).toBe("vite");
    expect(getProjectFileIconKind("tailwind.config.js")).toBe("tailwind");
    expect(getProjectFileIconKind(".gitignore")).toBe("git");
    expect(getProjectFileIconKind("Dockerfile")).toBe("docker");
    expect(getProjectFileIconKind("package-lock.json")).toBe("lock");
    expect(getProjectFileIconKind(".env.example")).toBe("config");
    expect(getProjectFileIconKind("scripts/start.ps1")).toBe("powershell");
  });

  it("maps media, document, archive, and fallback files", () => {
    expect(getProjectFileIconKind("docs/spec.pdf")).toBe("pdf");
    expect(getProjectFileIconKind("docs/plan.docx")).toBe("word");
    expect(getProjectFileIconKind("docs/slides.pptx")).toBe("powerpoint");
    expect(getProjectFileIconKind("README.md")).toBe("markdown");
    expect(getProjectFileIconKind("configs/app.yaml")).toBe("yaml");
    expect(getProjectFileIconKind("configs/app.toml")).toBe("toml");
    expect(getProjectFileIconKind("public/logo.png")).toBe("image");
    expect(getProjectFileIconKind("public/demo.mp4")).toBe("video");
    expect(getProjectFileIconKind("audio/voice.mp3")).toBe("audio");
    expect(getProjectFileIconKind("data/report.xlsx")).toBe("spreadsheet");
    expect(getProjectFileIconKind("release/app.zip")).toBe("archive");
    expect(getProjectFileIconKind("unknown/file.custom")).toBe("default");
  });
});
