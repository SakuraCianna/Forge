import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, updateModelEnabled } from "@/state/modelSettings";
import { ModelSelector } from "./ModelSelector";

describe("ModelSelector", () => {
  it("shows only enabled models in the model submenu", async () => {
    const user = userEvent.setup();
    const settings = updateModelEnabled(createDefaultModelSettings(), "openai:gpt-5.5", true);

    render(
      <ModelSelector
        settings={settings}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /GPT-5.5/ }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).getAllByText("GPT-5.5").length).toBeGreaterThan(0);
    expect(screen.queryByText("Claude Sonnet")).not.toBeInTheDocument();
  });
});
