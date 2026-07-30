# ADR 0006: Tauri 2 with a Rust core and React UI

- Status: accepted
- Date: 2026-07-29

## Context

The initial documents assumed a native macOS application and deferred other
platforms. The product requirement is now Windows, Linux, and macOS, with
macOS receiving the most platform polish.

The desktop application must do four materially different jobs:

1. keep a binary HID lease alive independently of UI responsiveness;
2. supervise a line-oriented Codex app-server child process;
3. render and test a spatial, accessible keyboard editor and HUD; and
4. package, sign, update, and recover on three desktop operating systems.

The renderer must not gain direct HID, shell, filesystem, or credential access.
There is no demonstrated need for a background daemon, public plugin loader,
generic form schema, or independently deployed service.

## Decision

Build one Tauri 2 desktop application:

- a Rust core owns coordination, HID, Codex process supervision, persistence,
  platform seams, and all side effects;
- React, TypeScript, and Vite render the main editor and HUD;
- renderer-to-core IPC exposes narrow semantic commands and revisioned,
  immutable view state;
- `control-core` contains pure allocation/composition state transitions;
- `surface-protocol` contains pure report codecs and golden vectors;
- Codex and Calendar remain trusted, compiled-in adapters;
- the application spawns the user-installed `codex app-server` directly over
  stdio without a shell;
- there is no daemon and no public plugin SDK in v0.

“One application” does not mean literally one operating-system process. Tauri
uses a Rust core process and platform webview processes. The architectural
claim is one logical state owner and no separately installed helper service.

## Why this is the smallest credible choice

Tauri keeps native-sensitive work in Rust while allowing fast, visually
testable React iteration. The Rust `hidapi` ecosystem has native backends for
Windows, macOS, and Linux. Tauri provides first-party packaging, tray, window,
and cryptographically signed updater support across the target platforms.

Electron would simplify pixel consistency but adds a bundled Chromium/Node
runtime and either a renderer permission model for WebHID or a native
`node-hid` rebuild/ABI matrix. Its core updater does not cover Linux. Those
costs do not buy a better safety boundary for this product.

Slint is a credible Rust-only fallback but has a smaller UI/testing and
distribution ecosystem for a complex spatial editor. Flutter, Avalonia, and
Wails add a second native bridge/runtime without eliminating the Rust HID and
process-supervision work.

No monorepo task runner, shared React package, schema framework, service bus,
dependency-injection framework, or generic integration SDK is introduced.
Those can be added only in response to measured duplication or isolation
needs.

## Platform consequences

- macOS ships as a non-App-Store Developer ID application so USB access and an
  installed Codex executable are not hidden behind an inappropriate sandbox.
- Windows uses WebView2 and a signed installer.
- Linux needs an explicit, narrowly scoped udev rule for the supported HID
  interface. Wayland may prevent exact no-focus HUD placement; the main
  application and tray remain the accessible fallback.
- GUI applications do not reliably inherit the user's interactive shell
  `PATH`, so Codex discovery is explicit and user-correctable.
- The HUD is created non-focusable before its first display. If a platform
  cannot preserve focus, a small platform shim is permitted without changing
  the core model.
- Calendar may be macOS-only or deferred. The application does not invent a
  cross-provider OAuth layer merely to claim parity.

## Evidence and review

This decision was adversarially reviewed against Tauri, Electron, Slint,
Flutter, Avalonia, and Wails. The review specifically challenged process
count, Linux permissions, Wayland, updater guarantees, native module rebuilds,
accessibility, and whether Rust was actually required.

Primary references:

- [Tauri process model](https://v2.tauri.app/concept/process-model/)
- [Tauri updater](https://v2.tauri.app/plugin/updater/)
- [Tauri WebDriver testing](https://v2.tauri.app/develop/tests/webdriver/)
- [Tauri system tray](https://v2.tauri.app/learn/system-tray/)
- [Tauri distribution](https://v2.tauri.app/distribute/)
- [HIDAPI](https://github.com/libusb/hidapi)
- [Rust hidapi crate](https://docs.rs/hidapi/latest/hidapi/)
- [Electron device access](https://www.electronjs.org/docs/latest/tutorial/devices)
- [Electron native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/)
