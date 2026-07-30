# ADR 0005: One process and built-in integrations first

- Status: Superseded in part by ADR 0006
- Date: 2026-07-29

## Context

A daemon, authenticated local RPC, Electron renderer, plugin workers, public
SDK, and integrated firmware builder introduce lifecycle, security, packaging,
and versioning work before the central interaction is proven.

## Decision

The initial product is one desktop application with one logical state owner,
built-in integrations, a minimal editor, and the interaction HUD. Firmware
build/install remains an explicit external workflow.

ADR 0006 replaces the literal process and macOS assumptions: a Tauri
application uses a Rust core plus platform webview processes and targets
macOS, Windows, and Linux. The decisions to avoid a daemon, public plugin SDK,
and arbitrary third-party code remain accepted.

## Consequences

- The first vertical slice has fewer failure boundaries.
- Internal modules preserve logical separation without process separation.
- Arbitrary third-party code is not loaded.
- A public plugin SDK requires evidence from at least three different built-in
  integrations.
- Separate processes are introduced only for a demonstrated lifecycle,
  privilege, isolation, or multi-client need.
