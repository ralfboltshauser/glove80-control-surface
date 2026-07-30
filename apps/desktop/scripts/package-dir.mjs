import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["exec", "electron-builder", "--dir"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(process.platform === "darwin"
      ? { CSC_IDENTITY_AUTO_DISCOVERY: "false" }
      : {}),
  },
});

process.exitCode = result.status ?? 1;
