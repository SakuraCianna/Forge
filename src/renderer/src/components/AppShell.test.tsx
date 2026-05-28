import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("exposes a navigable desktop workbench structure", () => {
    render(
      <AppShell language="en-US" currentProjectName="Forge" currentProjectPath="E:\\CodeHome\\Forge">
        <section>Workbench</section>
      </AppShell>
    );

    expect(screen.getByRole("navigation", { name: "Forge navigation" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Forge workbench" })).toHaveTextContent(
      "Workbench"
    );
  });
});
