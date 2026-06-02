import { describe, expect, it } from "vitest";
import { getProjectFolderIconKind } from "./projectFolderIcons";

describe("project folder icons", () => {
  it("maps common project folders to editor-style icon kinds", () => {
    expect(getProjectFolderIconKind("frontend/src")).toBe("src");
    expect(getProjectFolderIconKind("frontend/src/components")).toBe("components");
    expect(getProjectFolderIconKind("backend/routes")).toBe("routes");
    expect(getProjectFolderIconKind("docs")).toBe("docs");
    expect(getProjectFolderIconKind("node_modules")).toBe("node");
    expect(getProjectFolderIconKind(".github")).toBe("github");
    expect(getProjectFolderIconKind("public/media")).toBe("images");
    expect(getProjectFolderIconKind("unknown-folder")).toBe("default");
  });
});
