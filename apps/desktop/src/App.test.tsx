import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("presents the durable task board instead of chat configuration", () => {
    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getAllByText("Codex task board").length).toBeGreaterThan(0);
    expect(screen.getByText("No chat maintenance")).toBeInTheDocument();
    expect(screen.queryByText(/select a chat/i)).not.toBeInTheDocument();
  });

  it("dims the static preview without claiming a device write", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Dim lights" }));

    expect(screen.getByRole("button", { name: "Show lights" })).toBeInTheDocument();
    expect(
      screen.getByText("Preview lights dimmed — no device command sent"),
    ).toBeInTheDocument();
  });

  it("labels unavailable live actions instead of presenting dead controls", () => {
    render(<App />);

    expect(
      screen.getByText("Static preview — no Codex or keyboard connection"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open in codex/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /settings unavailable/i })).toBeDisabled();
  });
});
