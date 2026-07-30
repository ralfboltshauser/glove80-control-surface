import readline from "node:readline";

const fixture = {
  data: [
    {
      id: "019fae8a-5cb4-7e70-88d8-d0af1e99032c",
      parentThreadId: null,
      preview: "Build the Glove80 control surface",
      name: "Glove80 control surface",
      cwd: "/redacted/glove80-control-surface",
      createdAt: 1785400000,
      updatedAt: 1785400120,
      recencyAt: 1785400120,
      status: { type: "notLoaded" },
      source: "appServer",
    },
    {
      id: "019fae8a-5cb4-7e70-88d8-d0af1e99032e",
      parentThreadId: null,
      preview: "Wait for a user decision",
      name: null,
      cwd: "/redacted/another-project",
      createdAt: 1785400010,
      updatedAt: 1785400130,
      recencyAt: 1785400130,
      status: {
        type: "active",
        activeFlags: ["waitingOnUserInput"],
      },
      source: "cli",
    },
    {
      id: "019fae8a-5cb4-7e70-88d8-d0af1e99032d",
      parentThreadId: "019fae8a-5cb4-7e70-88d8-d0af1e99032c",
      preview: "Review it",
      name: null,
      cwd: "/redacted/glove80-control-surface",
      createdAt: 1785400020,
      updatedAt: 1785400110,
      recencyAt: 1785400110,
      status: { type: "notLoaded" },
      source: { subAgent: "threadSpawn" },
    },
  ],
  nextCursor: null,
  backwardsCursor: null,
};

const input = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const exitAfterInitialize = process.argv.includes("--exit-after-initialize");
const unknownCompletion = process.argv.includes("--unknown-completion");
const completionCycle = process.argv.includes("--completion-cycle");

input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      id: message.id,
      result: {
        userAgent: "fake-codex-app-server/0",
        platformFamily: "unix",
        platformOs: "test",
      },
    });
    if (exitAfterInitialize) {
      setTimeout(() => process.exit(17), 5);
    }
  } else if (message.method === "thread/list") {
    send({ id: message.id, result: fixture });
    if (unknownCompletion) {
      setTimeout(
        () =>
          send({
            method: "turn/completed",
            params: {
              threadId: fixture.data[0].id,
              turn: { status: "cancelled" },
            },
          }),
        5,
      );
    }
    if (completionCycle) {
      const threadId = fixture.data[0].id;
      setTimeout(
        () =>
          send({
            method: "turn/completed",
            params: { threadId, turn: { status: "completed" } },
          }),
        5,
      );
      setTimeout(
        () =>
          send({
            method: "turn/started",
            params: { threadId },
          }),
        10,
      );
      setTimeout(
        () =>
          send({
            method: "turn/completed",
            params: { threadId, turn: { status: "completed" } },
          }),
        15,
      );
    }
  }
});
