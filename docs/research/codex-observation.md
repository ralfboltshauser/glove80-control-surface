# Codex observation evidence

Observed on 2026-07-29. This document separates installed behavior from newer
manuals and source code.

## Installed surfaces

| Surface | Observed version |
| --- | --- |
| User-installed CLI | `codex-cli 0.144.6` |
| ChatGPT-bundled CLI | `0.146.0-alpha.3.1` |
| ChatGPT Codex backend | private `app-server` child over stdio |

The ChatGPT process did not expose the documented public daemon-control socket.
An unrelated `~/.codex/ipc/ipc.sock` exists but is undocumented and is not
treated as an integration API.

The desktop application must spawn an explicitly discovered user-installed
Codex binary directly, without a shell. GUI applications cannot assume the
interactive shell's `PATH`.

## Direct read-only probe

A separately spawned app-server could list 100 persisted tasks from the shared
Codex history. The result included:

- UUID and session ID;
- user-facing name or preview;
- created, updated, and recency timestamps;
- working directory and Git metadata;
- source kind;
- parent thread ID and subagent metadata where present.

It found the currently active Desktop root task and its running subagents. But:

- all 100 task statuses were `notLoaded`;
- `thread/loaded/list` returned no entries;
- reconstructed turns for work running in another process were not preserved
  as authoritative `inProgress` turns;
- approval and user-input requests belong to the owning connection; and
- no public app-server connection can attach to ChatGPT's private stdio child.

This is consistent with the current open-source implementation: runtime thread
managers and status aggregation are process-local, while persisted thread
listing can fall back to rollout history.

Primary implementation references:

- [Thread manager](https://github.com/openai/codex/blob/88d6c2b2b41b0790fa10c232f2a6be0e128cedd6/codex-rs/core/src/thread_manager.rs#L209-L213)
- [Runtime status aggregation](https://github.com/openai/codex/blob/88d6c2b2b41b0790fa10c232f2a6be0e128cedd6/codex-rs/app-server/src/thread_status.rs#L303-L452)
- [Thread enrichment](https://github.com/openai/codex/blob/88d6c2b2b41b0790fa10c232f2a6be0e128cedd6/codex-rs/app-server/src/request_processors/thread_enrichment.rs#L12-L78)
- [Official app-server guide](https://learn.chatgpt.com/docs/app-server)

The local state database also emitted malformed-image warnings during these
probes. On 2026-07-30, `thread/list` with `useStateDbOnly: true` returned zero
rows from both installed binaries, while the documented default rollout scan
listed current tasks. v0 therefore uses the official default listing path,
which may refresh Codex's metadata index from its own persisted rollout logs
but does not resume or change a task. The product never repairs or resets the
database directly, filters returned records client-side, and reports degraded
discovery honestly.

## Installed protocol surface

The generated installed schema exposes:

```text
ThreadStatus
├── notLoaded
├── idle
├── systemError
└── active
    ├── waitingOnApproval
    └── waitingOnUserInput
```

`thread/list` can sort by creation, update, or recency and filter by source,
working directory, provider, archive state, and title substring. Experimental
parent/ancestor filters exist, but an installed probe returned no children even
when the returned records contained correct parent IDs. v0 therefore builds
trees client-side from returned `parentThreadId` values.

The current manual mentions pins, but neither installed generated schema
contains `isPinned` or a pin mutation method. The product capability-detects
optional fields and does not expose a Pinned task-board strategy in v0.

The installed thread metadata gives no stable general tag API. Agent nicknames
are random, titles are renameable, and subagent identities are scoped to a
short-lived task tree. None is a suitable durable physical binding.

## Product consequence

The saved assignment is a selector over a changing collection:

```json
{
  "kind": "taskBoard",
  "workspaceRoots": [],
  "includeSources": ["vscode", "cli", "appServer"],
  "rootsOnly": true
}
```

It is never:

```json
{"threadId": "a-chat-that-will-be-obsolete-tomorrow"}
```

The application resolves eligible candidates, then applies sticky host-side
allocation. Existing represented tasks keep their cells; new tasks fill empty
cells or replace only an explicitly normal occupant. The complete mapping
freezes for a physical interaction epoch.

## Observation modes

### External discovery

Purpose: follow the user's changing Codex Desktop/CLI work with no per-chat
configuration.

Proven:

- discover and order changing tasks;
- show identity, title, workspace, age, and parent/subagent relation;
- open an admitted local task through `codex://threads/<thread-id>` on
  supported Desktop platforms.

Not proven:

- exact working/idle;
- approval or user-input waiting;
- exact completion timing;
- failure while the task remains owned by another process.

An external `notLoaded` task is **unknown**, never inferred idle.

### Owned live

Purpose: exact lifecycle for tasks intentionally started through this
application's own app-server connection.

The owning connection can receive thread status changes, turn start/completion,
approval requests, user-input requests, and failures. It must not resume a
Desktop-running task merely to gain ownership; that would create a second
runtime rather than attach to the first.

Owned-live is a capability, not the default mental model. Users should not have
to abandon Codex Desktop to make the keyboard useful.

## Official lifecycle-hook spike

Current Codex documentation exposes trusted lifecycle command hooks including:

- `UserPromptSubmit`;
- `PermissionRequest`;
- `Stop`;
- `SessionStart` and `SessionEnd`;
- `SubagentStart` and `SubagentStop`.

Common input contains `session_id`, `cwd`, event name, and model; turn-scoped
hooks also contain `turn_id`. This could supplement external app-server
discovery because `sessionId` is present on returned tasks.

The bridge is not accepted yet:

- command hooks require explicit user review/trust;
- synchronous commands must return extremely quickly and fail open;
- `Stop` can be followed by another hook that continues the turn;
- no hook alone proves a complete error state machine;
- installing or changing user-level hook configuration is an explicit setup
  mutation; and
- event delivery must be authenticated or constrained to the local user's app
  instance.

The smallest acceptable experiment is a bundled helper invoked by a
user-approved global hook. It writes one bounded event to a local
platform-appropriate IPC endpoint, returns no model-visible output, times out
immediately if the application is absent, and never reads the transcript.

Until that experiment passes, external tasks use unknown/recent presentation
rather than the Codex Micro live-state palette.

## Third-party comparison

Current community tools reach the same process boundary:

- [Dimillian CodexMonitor](https://github.com/Dimillian/CodexMonitor) spawns its
  own app-server and documents that external CLI sessions are not live-streamed
  unless resumed.
- [Cocoanetics CodexMonitor](https://github.com/Cocoanetics/CodexMonitor)
  watches rollout JSONL files and uses file activity.
- [AgentNotch](https://github.com/AppGram/agentnotch) combines rollout watching,
  optional telemetry, and idle timers.
- [Agent Sessions](https://github.com/jazzyalex/agent-sessions) combines file
  timestamps, processes, open files, and terminal-tail classification.

Those heuristics can communicate “recent activity” with reduced confidence.
They do not justify exact Desktop-owned approval, working, or failure colors.

## Platform navigation

The documented local link is:

```text
codex://threads/<thread-id>
```

ChatGPT Desktop and its deep link are available on macOS and Windows. Linux has
no equivalent Desktop application today; v0 must capability-gate opening and
may offer a validated terminal `codex resume <uuid>` fallback rather than
pretending a deep link exists.

WebSocket app-server transport is experimental. The product starts with
supervised stdio JSONL on every platform.
