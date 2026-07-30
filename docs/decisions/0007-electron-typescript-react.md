# ADR 0007: Electron with TypeScript and React

- Status: Accepted
- Date: 2026-07-30
- Supersedes: ADR 0006

## Context

ADR 0006 selected Tauri and Rust because native HID access from Electron was
treated as an unresolved rebuild, packaging, and ABI risk. That was an
assumption rather than evidence from the actual keyboard and installed
toolchain.

The product still needs one cross-platform desktop application that:

1. owns a vendor HID session without exposing it to web content;
2. supervises the user-installed `codex app-server` over stdio;
3. renders and tests a spatial React editor and interaction HUD; and
4. packages for macOS, Windows, and Linux.

The user explicitly prefers the simplest maintainable stack and questioned why
Rust was present when the product UI and integrations are TypeScript-shaped.

## Direct evidence

On this Mac, Electron 41.5.0 and `node-hid` 3.3.0 were tested together against
the connected Glove80 without sending a write:

- `node-hid` loaded under Electron's Node 24.15 runtime through N-API 10;
- it enumerated the MoErgo vendor HID collection at VID `0x16c0`, PID
  `0x27db`, usage page `0xff60`, usage `1`;
- a non-exclusive open read feature report ID `5` successfully and returned
  17 bytes including the report ID;
- the same operation succeeded from an unpacked application produced by
  electron-builder, not only from a development shell.

The exact observation is recorded in
[Electron HID probe](../research/electron-hid-probe.md).

## Decision

Build one Electron application:

- Electron main is the single authoritative runtime and owns HID, Codex child
  processes, persistence, platform seams, and all other side effects.
- React, TypeScript, and Vite render the editor and HUD.
- The renderer is sandboxed with `contextIsolation: true`,
  `nodeIntegration: false`, and a strict content security policy.
- A narrow preload bridge exposes only validated semantic bootstrap and
  command operations. It does not expose Node.js, `ipcRenderer`, filesystem
  paths, HID handles, or arbitrary channels.
- `surface-protocol` and `control-core` are small pure TypeScript workspace
  packages. They have no Electron or React dependency.
- `node-hid` is used from main; WebHID is not part of the architecture.
- Codex and Calendar remain trusted built-in adapters. There is no public
  plugin loader in v0.
- No daemon, worker, utility process, local RPC server, dependency-injection
  framework, schema framework, or monorepo task runner is added now.

A utility process may be introduced later only if measurement proves main
process latency can miss the keyboard lease. Until then, it is unnecessary
isolation and lifecycle surface.

## Why this is now the smallest credible choice

The application, protocol, integrations, renderer, tests, and process
supervision can share one language and one package manager. The HID concern
that previously justified Rust was tested directly and did not reproduce.
Electron also makes the renderer behavior consistent across target platforms
and allows the native application to reuse the same visual test harness.

This does not weaken the renderer boundary: native capabilities remain in main
behind an explicit preload allowlist. It does remove a Rust/TypeScript model,
codec, test, and IPC duplication cost that had no proven product benefit.

## Consequences

- Electron's download and packaged application are larger than a Tauri shell.
  That is accepted for v0 in exchange for one implementation language and
  known rendering behavior.
- Native module packaging remains a CI responsibility. `node-hid` must be
  smoke-tested in directory packages on macOS, Windows, and Linux.
- macOS distribution remains a non-App-Store Developer ID application.
- Windows and Linux HID behavior, Linux udev permissions, signed installers,
  updater strategy, and no-focus HUD behavior still require platform evidence.
- Historical Tauri milestone evidence remains in the repository as history,
  but no Tauri or Rust implementation remains on the active branch.

## Primary references

- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron context bridge](https://www.electronjs.org/docs/latest/api/context-bridge)
- [Electron native Node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [node-hid](https://github.com/node-hid/node-hid)
- [electron-builder](https://www.electron.build/)
