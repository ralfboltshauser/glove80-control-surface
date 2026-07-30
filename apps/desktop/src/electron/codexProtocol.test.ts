import { describe, expect, it } from "vitest";

import {
  isCodexThreadId,
  mapCodexThreads,
  parseThreadListPage,
  semanticState,
} from "./codexProtocol";

const id = "019fae8a-5cb4-7e70-88d8-d0af1e99032c";

describe("Codex protocol mapping", () => {
  it("keeps external notLoaded status explicitly unknown", () => {
    expect(semanticState({ type: "notLoaded" })).toBe("stale");
    expect(
      semanticState({
        type: "active",
        activeFlags: ["waitingOnApproval"],
      }),
    ).toBe("needsInput");
  });

  it("maps roots into tiles without presenting subagents as durable tasks", () => {
    const page = parseThreadListPage({
      data: [
        {
          id,
          parentThreadId: null,
          preview: "Build the control surface",
          name: "Glove80 app",
          cwd: "/Users/example/project",
          createdAt: 1,
          updatedAt: 2,
          recencyAt: 3,
          status: { type: "notLoaded" },
          source: "appServer",
        },
        {
          id: "019fae8a-5cb4-7e70-88d8-d0af1e99032d",
          parentThreadId: id,
          preview: "Review it",
          cwd: "/Users/example/project",
          createdAt: 1,
          updatedAt: 2,
          status: { type: "active", activeFlags: [] },
          source: { subAgent: "threadSpawn" },
        },
      ],
      nextCursor: null,
    });

    expect(
      mapCodexThreads(page.data, { actionEnabled: true }),
    ).toMatchObject([
      {
        resourceId: id,
        label: "Glove80 app",
        context: "project",
        state: "stale",
        action: { enabled: true },
      },
    ]);
  });

  it("accepts only UUID-shaped local thread identities for deep links", () => {
    expect(isCodexThreadId(id)).toBe(true);
    expect(isCodexThreadId("../malicious")).toBe(false);
    expect(isCodexThreadId("https://example.com")).toBe(false);
  });
});
