// 本文件说明: 渲染组件 模型供应商标识测试
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { providerCatalog } from "@shared/providerCatalog";
import { ProviderMark } from "./ProviderMark";

describe("ProviderMark", () => {
  it("uses SVG assets for newly added provider profiles instead of initials", () => {
    const providerIds = ["openrouter", "groq", "together", "mistral", "xai", "fireworks", "cerebras"];

    expect(
      providerIds.map((providerId) => providerCatalog.find((provider) => provider.id === providerId)?.iconAsset)
    ).toEqual(["openrouter", "groq", "together", "mistral", "xai", "fireworks", "cerebras"]);
  });

  it("uses downloaded Simple Icons assets where they are available", () => {
    expect(providerCatalog.find((provider) => provider.id === "openrouter")?.iconAsset).toBe(
      "openrouter"
    );
    expect(providerCatalog.find((provider) => provider.id === "mistral")?.iconAsset).toBe(
      "mistral"
    );
  });

  it("renders configured provider assets as images", () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "groq")!;
    const { container } = render(<ProviderMark provider={provider} fallbackLabel={provider.label} />);

    expect(container.querySelector("img")).toBeInTheDocument();
  });
});
