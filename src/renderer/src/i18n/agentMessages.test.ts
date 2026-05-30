// 本文件说明: 验证 Agent 执行和命令安全提示会按界面语言本地化
import { describe, expect, it } from "vitest";
import {
  formatAgentCommandDenied,
  formatAgentCommandNeedsApproval,
  formatAgentCommandRiskReason,
  formatAgentPermissionDenied
} from "./agentMessages";

describe("agentMessages", () => {
  it("localizes built-in command risk reasons for the Chinese interface", () => {
    expect(
      formatAgentCommandRiskReason(
        "zh-CN",
        "command may change dependencies or project state"
      )
    ).toBe("命令会修改依赖或项目状态");
    expect(
      formatAgentCommandRiskReason("zh-CN", "command may change Git history or remote state")
    ).toBe("命令会修改 Git 历史或远端状态");
    expect(
      formatAgentCommandRiskReason("zh-CN", "command can delete files or rewrite history")
    ).toBe("命令可能删除文件或重写历史");
  });

  it("keeps custom command rule reasons as authored by the user", () => {
    expect(formatAgentCommandRiskReason("zh-CN", "publishes preview")).toBe(
      "publishes preview"
    );
    expect(
      formatAgentCommandRiskReason(
        "en-US",
        "command may change dependencies or project state"
      )
    ).toBe("command may change dependencies or project state");
  });

  it("formats command gates with localized reasons", () => {
    expect(
      formatAgentCommandNeedsApproval(
        "zh-CN",
        "npm install",
        "command may change dependencies or project state"
      )
    ).toBe("命令需要确认后才能运行: npm install (命令会修改依赖或项目状态)");
    expect(
      formatAgentCommandDenied("zh-CN", "command can delete files or rewrite history")
    ).toBe("命令已被安全策略拒绝: 命令可能删除文件或重写历史");
  });

  it("formats agent profile permission denials by language", () => {
    expect(formatAgentPermissionDenied("zh-CN", "Review", "edit")).toBe(
      "Agent 配置 Review 不允许执行编辑操作"
    );
    expect(formatAgentPermissionDenied("en-US", "Review", "edit")).toBe(
      "Agent profile Review does not allow edit actions"
    );
  });
});
