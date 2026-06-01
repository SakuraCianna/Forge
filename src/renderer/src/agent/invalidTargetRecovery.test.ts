import { describe, expect, it } from "vitest";
import {
  collectInvalidTargetRecoveryCandidates,
  formatInvalidTargetRecoveryMessage
} from "./invalidTargetRecovery";

const projectFiles = [
  { relativePath: "backend/routes/accidents.py", size: 1000 },
  { relativePath: "frontend/src/components/AccidentList.tsx", size: 2000 },
  { relativePath: "frontend/src/components/AccidentDetail.tsx", size: 2200 },
  { relativePath: "README.md", size: 100 }
];

describe("invalid target recovery", () => {
  it("extracts existing files and known directory prefixes from prose targets", () => {
    const candidates = collectInvalidTargetRecoveryCandidates(
      "比较关键信息: - backend/routes/accidents.py 中的路由列表 - frontend/src/components/下的组件",
      projectFiles
    );

    expect(candidates.files).toEqual(["backend/routes/accidents.py"]);
    expect(candidates.directories).toContain("backend/routes");
    expect(candidates.directories).toContain("frontend/src/components");
  });

  it("uses unique basenames when the model only mentions a filename", () => {
    const candidates = collectInvalidTargetRecoveryCandidates(
      "修复 accidents.py 并检查组件",
      projectFiles
    );

    expect(candidates.files).toEqual(["backend/routes/accidents.py"]);
  });

  it("formats actionable messages with recovery hints", () => {
    const message = formatInvalidTargetRecoveryMessage("zh-CN", "Invalid edit target: foo", {
      files: ["backend/routes/accidents.py"],
      directories: ["frontend/src/components"]
    });

    expect(message).toContain("候选文件: backend/routes/accidents.py");
    expect(message).toContain("候选目录: frontend/src/components");
    expect(message).toContain("生成修复计划");
  });
});
