import { describe, expect, it } from "vitest";
import { getProjectFileIconKind } from "./projectFileIcons";

describe("project file icons", () => {
  it("maps common source and config files to semantic icon kinds", () => {
    expect(getProjectFileIconKind("src/App.tsx")).toBe("code");
    expect(getProjectFileIconKind("backend/main.py")).toBe("code");
    expect(getProjectFileIconKind("package.json")).toBe("config");
    expect(getProjectFileIconKind("package-lock.json")).toBe("lock");
    expect(getProjectFileIconKind(".env.example")).toBe("config");
    expect(getProjectFileIconKind("scripts/start.ps1")).toBe("terminal");
  });

  it("maps media, document, archive, and fallback files", () => {
    expect(getProjectFileIconKind("docs/spec.pdf")).toBe("pdf");
    expect(getProjectFileIconKind("docs/plan.docx")).toBe("document");
    expect(getProjectFileIconKind("public/logo.png")).toBe("image");
    expect(getProjectFileIconKind("public/demo.mp4")).toBe("video");
    expect(getProjectFileIconKind("audio/voice.mp3")).toBe("audio");
    expect(getProjectFileIconKind("data/report.xlsx")).toBe("spreadsheet");
    expect(getProjectFileIconKind("release/app.zip")).toBe("archive");
    expect(getProjectFileIconKind("unknown/file.custom")).toBe("default");
  });
});
