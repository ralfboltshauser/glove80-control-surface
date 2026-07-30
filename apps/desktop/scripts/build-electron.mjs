import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  sourcemap: true,
  external: ["electron", "node-hid"],
  logLevel: "info",
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/electron/main.ts"],
    outfile: "dist-electron/main.cjs",
  }),
  build({
    ...shared,
    entryPoints: ["src/electron/preload.ts"],
    outfile: "dist-electron/preload.cjs",
  }),
]);
