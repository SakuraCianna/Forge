import { describe, expect, it } from "vitest";
import { pickProjectDirectory } from "./projectPicker";

describe("projectPicker", () => {
  it("returns the selected directory path", async () => {
    const path = await pickProjectDirectory(async () => ({
      canceled: false,
      filePaths: ["E:\\CodeHome\\Forge"]
    }));

    expect(path).toBe("E:\\CodeHome\\Forge");
  });

  it("returns null when the picker is cancelled", async () => {
    const path = await pickProjectDirectory(async () => ({
      canceled: true,
      filePaths: []
    }));

    expect(path).toBeNull();
  });
});
