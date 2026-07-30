import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  BoundedJsonlDecoder,
  CodexAppServerClient,
  calculateRestartDelay,
  discoverCodexExecutable,
} from "./codexAppServer";

describe("CodexAppServerClient", () => {
  it("initializes over bounded JSONL and discovers changing root tasks", async () => {
    const fixture = path.resolve(
      process.cwd(),
      "../../fixtures/fake-codex-app-server.mjs",
    );
    const health: string[] = [];
    const snapshot = await new Promise<{
      client: CodexAppServerClient;
      ids: string[];
    }>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Fake app-server timed out.")),
        5_000,
      );
      const client = new CodexAppServerClient({
        executable: process.execPath,
        args: [fixture],
        version: "fake 0",
        pollIntervalMs: 60_000,
        onHealth: (next) => health.push(next.connection),
        onSnapshot: (next) => {
          clearTimeout(timeout);
          resolve({
            client,
            ids: next.threads.map((thread) => thread.id),
          });
        },
      });
      client.start();
    });

    snapshot.client.stop();
    expect(snapshot.ids).toHaveLength(3);
    expect(health).toContain("connecting");
  });

  it("rejects a JSONL line before unbounded buffering", () => {
    const decoder = new BoundedJsonlDecoder(8);
    expect(() => decoder.push(Buffer.from("123456789"))).toThrow(
      "oversized JSONL line",
    );
  });

  it("keeps restart jitter within an increasing hard ceiling", () => {
    expect(calculateRestartDelay(0, 100, 250, 0.5)).toBe(100);
    expect(calculateRestartDelay(1, 100, 250, 0.5)).toBe(200);
    expect(calculateRestartDelay(2, 100, 250, 1)).toBe(250);
  });

  it("ignores output from a superseded child session", async () => {
    const client = new CodexAppServerClient({
      executable: process.execPath,
      onHealth: () => undefined,
      onSnapshot: () => undefined,
    });
    let resolved = false;
    const timeout = setTimeout(() => undefined, 60_000);
    const currentChild = {};
    const staleChild = {};
    const internal = client as unknown as {
      child: unknown;
      pending: Map<
        number,
        {
          resolve: () => void;
          reject: () => void;
          timeout: ReturnType<typeof setTimeout>;
        }
      >;
      receive: (chunk: Buffer, child: unknown) => void;
    };
    internal.child = currentChild;
    internal.pending.set(1, {
      resolve: () => {
        resolved = true;
      },
      reject: () => undefined,
      timeout,
    });

    internal.receive(
      Buffer.from('{"id":1,"result":{"stale":true}}\n'),
      staleChild,
    );
    clearTimeout(timeout);
    expect(resolved).toBe(false);
    expect(internal.pending.has(1)).toBe(true);
  });

  it("disconnects an inbound message flood before monopolizing main", () => {
    const client = new CodexAppServerClient({
      executable: process.execPath,
      onHealth: () => undefined,
      onSnapshot: () => undefined,
    });
    const kill = vi.fn();
    const currentChild = { kill };
    const internal = client as unknown as {
      child: unknown;
      receive: (chunk: Buffer, child: unknown) => void;
    };
    internal.child = currentChild;

    internal.receive(Buffer.from("{}\n".repeat(2_049)), currentChild);
    expect(kill).toHaveBeenCalledOnce();
    expect(internal.child).toBeUndefined();
  });

  it("disconnects a stderr flood before monopolizing main", () => {
    const client = new CodexAppServerClient({
      executable: process.execPath,
      onHealth: () => undefined,
      onSnapshot: () => undefined,
    });
    const kill = vi.fn();
    const currentChild = { kill };
    const internal = client as unknown as {
      child: unknown;
      receiveStderr: (chunk: Buffer, child: unknown) => void;
    };
    internal.child = currentChild;

    internal.receiveStderr(Buffer.alloc(4 * 1_048_576 + 1), currentChild);
    expect(kill).toHaveBeenCalledOnce();
    expect(internal.child).toBeUndefined();
  });

  it("restarts a crashed app-server with bounded backoff", async () => {
    const fixture = path.resolve(
      process.cwd(),
      "../../fixtures/fake-codex-app-server.mjs",
    );
    let client: CodexAppServerClient;
    let connecting = 0;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("App-server did not restart.")),
        3_000,
      );
      client = new CodexAppServerClient({
        executable: process.execPath,
        args: [fixture, "--exit-after-initialize"],
        version: "fake 0",
        restartBaseMs: 10,
        restartMaximumMs: 20,
        random: () => 0.5,
        onSnapshot: () => undefined,
        onHealth: (health) => {
          if (
            health.connection !== "connecting" ||
            !health.detail.startsWith("Starting")
          ) {
            return;
          }
          connecting += 1;
          if (connecting >= 2) {
            clearTimeout(timeout);
            resolve();
          }
        },
      });
      client.start();
    });
    client!.stop();
    expect(connecting).toBeGreaterThanOrEqual(2);
  });

  it("does not present an unknown terminal notification as idle", async () => {
    const fixture = path.resolve(
      process.cwd(),
      "../../fixtures/fake-codex-app-server.mjs",
    );
    let client: CodexAppServerClient;
    let snapshots = 0;
    const status = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Unknown completion timed out.")),
        5_000,
      );
      client = new CodexAppServerClient({
        executable: process.execPath,
        args: [fixture, "--unknown-completion"],
        version: "fake 0",
        pollIntervalMs: 60_000,
        onHealth: () => undefined,
        onSnapshot: (snapshot) => {
          snapshots += 1;
          if (snapshots < 2) return;
          clearTimeout(timeout);
          resolve(snapshot.threads[0]?.status.type ?? "missing");
        },
      });
      client.start();
    });
    client!.stop();
    expect(status).toBe("notLoaded");
  });

  it("assigns a new ordered revision after repeated completion cycles", async () => {
    const fixture = path.resolve(
      process.cwd(),
      "../../fixtures/fake-codex-app-server.mjs",
    );
    let client: CodexAppServerClient;
    const revisions: number[] = [];
    const finalUnread = await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Completion cycle timed out.")),
        5_000,
      );
      client = new CodexAppServerClient({
        executable: process.execPath,
        args: [fixture, "--completion-cycle"],
        version: "fake 0",
        pollIntervalMs: 60_000,
        onHealth: () => undefined,
        onSnapshot: (snapshot) => {
          const thread = snapshot.threads[0];
          if (!thread) return;
          revisions.push(thread.observedRevision);
          if (revisions.length < 4) return;
          clearTimeout(timeout);
          resolve(snapshot.completedUnread.has(thread.id));
        },
      });
      client.start();
    });
    client!.stop();
    expect(revisions).toEqual([...revisions].sort((left, right) => left - right));
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(finalUnread).toBe(true);
  });

  it.skipIf(process.env.GLOVE80_LIVE_CODEX_TEST !== "1")(
    "lists actual persisted Codex tasks without resuming them",
    async () => {
      const executable = await discoverCodexExecutable();
      if (!executable) throw new Error("Codex CLI was not discovered.");
      let client: CodexAppServerClient;
      const snapshot = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Live app-server timed out.")),
          15_000,
        );
        client = new CodexAppServerClient({
          executable,
          pollIntervalMs: 60_000,
          onHealth: () => undefined,
          onSnapshot: (next) => {
            clearTimeout(timeout);
            resolve(next.threads.length);
          },
        });
        client.start();
      });
      client!.stop();
      expect(snapshot).toBeGreaterThan(0);
    },
  );
});
