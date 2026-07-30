import { spawn } from "node:child_process";

const children = new Set();
let exiting = false;

function start(command, args, environment = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...environment },
  });
  children.add(child);
  child.once("exit", (code) => {
    children.delete(child);
    if (!exiting && code !== 0) {
      shutdown(code ?? 1);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exitCode = code;
}

process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());

const vite = start("pnpm", ["exec", "vite"]);
await waitFor("http://127.0.0.1:1420/");
await run("pnpm", ["build:electron"]);
const electron = start(
  "pnpm",
  ["exec", "electron", "."],
  { GLOVE80_DEV_SERVER_URL: "http://127.0.0.1:1420/" },
);

await Promise.race([exited(vite), exited(electron)]);
shutdown();

async function waitFor(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? "no status"}`));
    });
  });
}

function exited(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}
