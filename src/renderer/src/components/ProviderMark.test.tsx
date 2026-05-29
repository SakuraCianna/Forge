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

  it("renders configured provider assets as images", () => {
    const provider = providerCatalog.find((candidate) => candidate.id === "groq")!;
    const { container } = render(<ProviderMark provider={provider} fallbackLabel={provider.label} />);

    expect(container.querySelector("img")).toBeInTheDocument();
  });
});
