# Milestone 2 verification

Date: 2026-07-30

## Scope

Milestone 2 replaces the generated task source with a supervised
`codex app-server` child in Electron main. It deliberately leaves the
`SurfaceDevice` simulated. Startup does not enumerate or write to a keyboard,
change Codex tasks, install hooks, or alter Codex configuration.

## Direct observations on this Mac

- The discovered executable was the user-installed `codex-cli 0.144.6`.
- An opt-in integration test initialized that exact binary and listed current
  local tasks.
- The signed packaged Electron app completed the same handshake, discovered
  26 current root tasks, filled five configured physical slots, and reported
  21 overflow tasks.
- A first packaged launch spent roughly one minute in an honest
  `Initializing` state while Codex indexed persisted history. The renderer
  remained responsive and changed to `online` only after a valid snapshot.
- Every externally owned task was returned as `notLoaded`. The app therefore
  rendered `Stale`/unknown rather than inventing working, idle, completion,
  failure, or input-needed state.
- Opening the selected task used the admitted local
  `codex://threads/<validated-uuid>` link. No command or arbitrary URL was
  executed.

## Implementation boundary

The implementation adds three plain Electron-main modules:

- `codexAppServer.ts` owns one child process, bounded JSONL, request timeouts,
  periodic refresh, and restart backoff;
- `codexProtocol.ts` validates the small response subset and maps it to
  existing semantic tiles; and
- `codexTaskSource.ts` publishes snapshots into the existing control core.

There is no daemon, local server, database, worker, dependency-injection
framework, public plugin runtime, or provider abstraction. Electron preload
adds one state-change subscription; the renderer remains sandboxed.

## Adversarial review

Architecture/minimalism, Electron reliability/security, and UX/accessibility
reviewers all passed the final tree with no remaining blocker.

Their findings produced focused corrections rather than new layers:

- all bootstrap, pushed, and command-result view states pass through one
  monotonic renderer revision gate;
- old child output, pipe errors, request queues, outbound backpressure, and
  stdout/stderr rates are bounded per app-server session;
- restart backoff resets only after a valid online snapshot;
- task observation revisions are monotonic counters rather than unordered
  hashes, so a later completion cannot reuse an acknowledged revision;
- unknown terminal notifications remain unknown rather than becoming idle;
  and
- the inspector and HUD say `occupied` and `more tasks`, never `active` or
  `waiting`, when the external process cannot prove either claim.

The reviewers explicitly found no need for a daemon, generic supervisor,
dependency-injection framework, integration registry, or plugin loader.

## Reliability and safety evidence

- Child launch does not use a shell.
- Incoming JSONL lines are capped at 1 MiB and pending requests at 32.
- Requests time out, child crashes restart with bounded exponential jitter,
  stderr diagnostics are capped, and malformed output disconnects the child.
- Unexpected server-to-client requests are rejected because this observer
  never owns turns or approvals.
- External task identity and action availability are frozen for an
  interaction epoch.
- Deep links require an RFC-shaped UUID and use one fixed scheme/path.
- Runtime task IDs and health are not persisted as configuration.
- The six-cell HID adapter and all keyboard writes remain outside this
  milestone.

## Commands passed locally

```text
pnpm install --frozen-lockfile
pnpm check
GLOVE80_LIVE_CODEX_TEST=1 \
  pnpm --filter @glove80-control-surface/desktop \
  exec vitest run src/electron/codexAppServer.test.ts
pnpm --filter @glove80-control-surface/desktop package:dir
pnpm --filter @glove80-control-surface/desktop smoke:packaged
codesign --verify --deep --strict \
  "apps/desktop/release/mac-arm64/Glove80 Control Surface.app"
git diff --check
```

The normal suite contains 101 passing tests and one intentionally skipped live
test:

- `surface-protocol`: 9
- `control-core`: 16
- desktop renderer, runtime, persistence, lifecycle, protocol, and supervised
  child: 76

With the explicit live flag, all ten app-server tests pass, including one
against the installed binary. The packaged native smoke test loaded HIDAPI
`0.15.0` without enumerating devices.

## Visual evidence

`docs/screenshots/milestone-2/live-codex-packaged-dark.png` is the signed
packaged app showing the actual 26-task snapshot. The keyboard lighting in
that image remains an explicitly labeled simulator.

## Remaining evidence boundary

A separately spawned app-server cannot observe authoritative live state for a
task owned by Codex Desktop or another CLI process. Exact working,
input-needed, completion, and failure colors require an additional trusted
lifecycle signal or a task owned by this app. That limitation is documented in
`docs/research/codex-observation.md` and remains visible in the product.

Milestone 3 may add the already proven six-cell HID adapter, but any live LED
write requires a separate user approval. No firmware flash is authorized.
