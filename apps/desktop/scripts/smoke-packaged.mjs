import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const releaseDirectory = path.resolve("release");
const executableCandidates =
  process.platform === "darwin"
    ? ["mac-arm64", "mac"].flatMap((directory) =>
        ["Glove80 Control Surface", "glove80-control-surface"].map((name) =>
          path.join(
            releaseDirectory,
            directory,
            `${name}.app`,
            "Contents",
            "MacOS",
            name,
          ),
        ),
      )
    : process.platform === "win32"
      ? [
          path.join(
            releaseDirectory,
            "win-unpacked",
            "glove80-control-surface.exe",
          ),
          path.join(
            releaseDirectory,
            "win-unpacked",
            "Glove80 Control Surface.exe",
          ),
        ]
      : [
          path.join(
            releaseDirectory,
            "linux-unpacked",
            "glove80-control-surface",
          ),
        ];
const executable = executableCandidates.find(existsSync);

if (!executable) {
  throw new Error(
    `Packaged executable was not found at ${executableCandidates.join(" or ")}`,
  );
}

const command = process.platform === "linux" ? "xvfb-run" : executable;
const arguments_ =
  process.platform === "linux"
    ? ["-a", executable, "--smoke-test"]
    : ["--smoke-test"];
const result = spawnSync(command, arguments_, {
  stdio: "inherit",
  timeout: 30_000,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
