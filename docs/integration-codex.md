# Codex integration UX

## Product promise

The user configures a physical **Codex task board** once. Current tasks flow
onto its keys automatically:

```text
Codex task board
├── key 1 → active task A
├── key 2 → task B needs input
├── key 3 → task C completed with an unread update
└── key 4 → recent idle task D
```

A key keeps its ordinary typing behavior outside the firmware-installed surface
layer. While the trigger is held, pressing a populated key opens the task it
currently represents.

The user does not bind every short-lived chat manually. Fixed-task binding is
excluded from v0; it may return only if real long-lived-task use justifies it.

This is a standalone cross-platform desktop application. It uses documented
deep links and app-server data only where this client is proven to observe
them; it is not layered on the Codex UI, Codex Micro settings, or another
overlay product.

The durable Codex noun is **task**, backed by a thread identifier. An active
agent run is a turn within that task; the product does not invent a separate
durable “agent” object.

## What Codex Micro proves

OpenAI's current Codex Micro has six Agent Keys and four source strategies:

- most recently updated chats, the default;
- pinned chats;
- priority chats, with waiting-for-input, unread, and active chats first; and
- custom chat assignments.

Its documented status language is:

| Light | Documented meaning |
| --- | --- |
| Off | no assigned chat |
| White | idle |
| Blue | thinking |
| Green | complete with an unread update |
| Amber | approval or response required |
| Red | error |

A selected chat pulses in its status color. A single press selects the chat
without foregrounding ChatGPT; a double press within 350 ms also brings the app
forward. An unassigned custom key creates a new chat. Separate command keys,
joystick, dial, push-to-talk, and Work Louder layers serve that dedicated
device.

The reusable principles are:

- configure a task source once rather than assigning every short-lived chat;
- make one key represent one task at a time;
- use lighting for actionable lifecycle state;
- keep completion green only while its update is unread;
- expose connection, battery, brightness, and status text in the app; and
- keep task identity visible in text because RGB cannot encode identity.

The Glove80 product does **not** copy the six-key limit, double-tap gesture,
command-key partition, joystick, dial, app layers, or private ChatGPT hardware
integration. Codex Micro's palette is fixed; the Glove80 app deliberately
allows accessible global and per-board presentation overrides.

Sources:

- [OpenAI Codex Micro guide](https://learn.chatgpt.com/docs/features/codex-micro)
- [OpenAI Supply Codex Micro product page](https://openai.com/supply/co-lab/work-louder/)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [ChatGPT desktop commands and deep links](https://learn.chatgpt.com/docs/reference/commands)

## v0 setup

The first-run flow is:

1. The app connects to an installed Codex app-server and states its exact
   observation scope.
2. The user creates one **Codex task board** assignment.
3. The user selects any ordered group of Glove80 keys on either or both halves.
4. The app previews task churn and explains that no chat selection is saved.
5. The inspector shows:

```text
Integration     Codex
Represents      Task board
Keys            LH 1, LH 2, LH 3, LH 4, RH 7, RH 8
Tasks           Fills automatically
When pressed    Open task
Visibility      Always
Appearance      Glove80 status default
```

The app may suggest six convenient cells during onboarding, but six is never a
product limit. The user may choose one key, all 80 available RGB cells, or any
ordered subset across both halves.

Only **Keys** is required. Priority and retention are product behavior, not an
onboarding questionnaire.

The v0 source is:

| Source | Meaning |
| --- | --- |
| Priority | error, needs-input, active, and completed/unread tasks, then recent idle tasks |

An optional workspace restriction may narrow the collection. There is no task
picker, fixed-task binding, Pinned strategy, or saved thread identifier in v0.
The installed Codex schemas do not expose pins.

## Stable automatic allocation

The task source produces candidates; the host allocates them to the board's
ordered cells. Status changes do not continuously reorder the board.

Rules:

1. A represented task stays on the same cell while it remains eligible.
2. A new task uses the first empty cell.
3. Active and needs-input tasks are protected while that state persists.
4. Error and completed/unread tasks are protected until opened or otherwise
   acknowledged.
5. When full, the oldest idle or acknowledged task may be replaced by a more
   relevant candidate.
6. If every cell is protected, extra tasks remain in overflow instead of
   making visible tasks jump.
7. The canvas, menu status, and interaction HUD show `+N more` when overflow
   exists.
8. The complete allocation freezes at `MODE_ENTER`.

After a completed task is opened and acknowledged, it remains sticky while
space is available. It becomes the first eviction candidate only when another
relevant task needs the cell. There is no periodic reshuffle merely because
time passed.

If a represented task is archived or deleted, its key becomes unavailable
rather than silently opening a different task during an interaction. Normal
allocation resumes after the interaction epoch ends.

This policy makes the board self-maintaining without making the keys feel
random.

## Keyboard states

| Semantic state | Default presentation | Exact meaning |
| --- | --- | --- |
| Empty slot | off | no task currently allocated |
| Idle | white, solid | task exists and has no active turn or unread completion |
| Working | blue, pulse | a turn is in progress |
| Completed/unread | green, solid | a turn completed and is not acknowledged |
| Needs input | amber, pulse | an observed approval or user-input request is pending |
| Error | red, solid | turn failed or thread entered a system error |
| Stale/unavailable | dim neutral | observation expired or task became unavailable |

No default blinks. Reduced-motion replaces pulse with luminance. Color-blind
palettes may change hues while preserving semantic names.

The integration has two explicitly different observation scopes:

| Scope | Proven capability |
| --- | --- |
| External discovery | Discover, order, label, and open changing Desktop/CLI tasks from persisted app-server data; live status is unknown |
| Owned live | Exact runtime status and lifecycle events for tasks started through this application's own app-server connection |

Direct probes against the installed `0.144.6` CLI and ChatGPT-bundled
`0.146.0-alpha.3.1` binary found active Desktop tasks but reported every one as
`notLoaded` from a separate server. The owning process's approval and
user-input requests are not observable by the watcher.

Therefore an externally discovered task is never shown as idle merely because
its status is `notLoaded`. Working, needs-input, and exact failure colors are
used only when an authoritative live source exists. A bounded official
lifecycle-hook bridge is being evaluated as a one-time enhanced-status option;
it is not silently assumed.

Codex Micro uses pulse for the selected chat, not as its documented working or
needs-input effect. The Glove80 default deliberately adds pulse to working and
needs-input states because this app cannot yet observe selection and those
states need attention.

Presentation precedence is:

```text
stale/unavailable → error → needs input → working → completed/unread → idle
```

## Press behavior

Outside the surface layer:

```text
press left 1 → type "1"
```

While the trigger is held:

```text
press left 1 → open/front the task currently shown on left 1
```

The allocation, task identity, and observed revision freeze at `MODE_ENTER`.
At `KEY_DOWN`, the adapter requires that same task identity and current action
validity. It never substitutes a newly allocated task under the user's finger.

The action uses `codex://threads/<thread-id>` for admitted local tasks. Opening
the task acknowledges an app-local completed/unread state. If a first-party
read signal is later proven, that source becomes authoritative.

An empty slot has no action in v0. Creating a new task from an empty key is a
useful later behavior, but automatic reassignment after creation must first be
proven.

v0 deliberately has:

- one press gesture;
- one action, **Open task**;
- no approve or decline key;
- no automatic command execution;
- no double-tap focus distinction; and
- no generic “run a Skill” binding.

## What appears in the app and HUD

The canvas previews every currently allocated task on the real two-half
geometry. Each cell keeps its normal key legend and adds a small Codex badge.
Selecting the board shows:

- source strategy and ordered cells;
- current task-to-cell allocation;
- each task's title, workspace, state, and last update;
- protected versus normal allocation status;
- overflow count;
- stale or unsupported reasons; and
- a complete state preview strip.

The non-activating HUD shown while the trigger is held uses text:

```text
1  Release Glove80 Surface · Needs approval  → Open task
2  Calendar adapter · Working                → Open task
3  Firmware notes · Completed                → Open task
                                      +2 more
```

RGB communicates attention; the HUD communicates identity and action.

## Configuration scopes

### Application

- global surface brightness and pause;
- palette, reduced motion, no flash, and privacy mode;
- launch at login and menu-bar behavior.

### Codex integration

- connected Codex source, health, and exact live-observation scope;
- visible local workspaces if the source exposes several;
- whether task titles may appear in the HUD and notifications.

### Task board

- ordered physical cells;
- optional workspace scope;
- Open task action;
- always or attention-only visibility;
- optional presentation override.

## Remaining uncertainties

- Whether a trusted, fail-open official lifecycle-hook bridge can add
  cross-process live events without delaying Codex or requiring brittle
  transcript parsing.
- The official deep link opens a local thread. Other task sources are excluded
  until their navigation and live-state behavior are proven.
- Cross-client read acknowledgement may not exist. The v0 fallback is
  explicitly app-local.
- Overflow and eviction thresholds require testing with real high-churn use.
- Nested subagents appear in evolving app-server metadata but are not a stable
  binding identity for v0.
