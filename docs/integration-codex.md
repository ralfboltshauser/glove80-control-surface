# Codex integration UX

## Product promise

A Codex-bound Glove80 key represents one Codex task. Its LED answers “does this
task need me?” while normal typing remains unchanged. Holding the installed
surface trigger and pressing the key opens that task in Codex.

This is a standalone macOS application and menu-bar surface. It uses documented
deep links and app-server events only where this client is proven to observe
them; it is not layered on the Codex UI, Codex Micro settings, or another
overlay product.

The v0 noun is **task**, backed by Codex's thread identifier. An active agent
run is a turn within that task; the product does not invent a separate durable
“agent” object.

## What Codex Micro proves

OpenAI's current Codex Micro uses six Agent Keys with this status language:

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
forward. Users can source the six keys from recent, pinned, priority, or custom
chat assignments. Separate command keys, a joystick, dial, push-to-talk flow,
lighting controls, and additional Work Louder layers serve that dedicated
device.

The reusable principles are:

- one key has one immediately understandable task identity;
- lighting represents actionable lifecycle state;
- green represents unread completion rather than historical completion, so the
  host needs an explicit acknowledgement policy;
- status and selection are separate visual dimensions;
- device connection, battery, brightness, and idle-light timeout stay visible
  in settings; and
- a meaningful remote state change can wake sleeping status lights.

The Glove80 product does **not** copy the six-key limit, double-tap gesture,
command-key partition, joystick, dial, app layers, or private ChatGPT hardware
integration. Codex Micro's status palette is fixed; the Glove80 app
deliberately allows accessible global and per-key presentation overrides. Its
existing typing layers remain the user's source of truth.

Sources:

- [OpenAI Codex Micro guide](https://learn.chatgpt.com/docs/features/codex-micro)
- [OpenAI Supply Codex Micro product page](https://openai.com/supply/co-lab/work-louder/)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [ChatGPT desktop app commands and deep links](https://learn.chatgpt.com/docs/reference/commands)

## v0 setup

The first-run flow is:

1. The user enables **Codex** in the integration rail.
2. The app connects to a Codex source whose live observation capability has
   been proven and reports its exact scope.
3. The user clicks a Glove80 key on the visual canvas.
4. In the inspector, the user chooses:

```text
Integration     Codex
Represents      Specific task
Task            Release Glove80 Control Surface
When pressed    Open task
Visibility      Always
Appearance      Glove80 status default
```

The task picker admits only local, deep-link-compatible threads visible to the
connected source. It searches by title and shows project/workspace, updated
time, pin state, and live status where available. Saving stores the stable
thread ID, not its mutable title.

An unbound key remains off. Deleting or archiving a bound task does not silently
assign another task; the binding becomes visibly unavailable until the user
repairs or removes it.

## Keyboard states

| Semantic state | Default presentation | Exact v0 meaning |
| --- | --- | --- |
| Unbound | off | no Codex binding |
| Idle | white, solid | task exists and has no active turn or unread completion |
| Working | blue, pulse | a turn is in progress |
| Completed/unread | green, solid | a turn completed and its update has not been acknowledged |
| Needs input | amber, pulse | a currently pending approval or user-input request exists |
| Error | red, solid | turn failed or thread entered a system error |
| Stale/unavailable | dim neutral | app-server disconnected, snapshot expired, or task unavailable |

No default blinks. Reduced-motion replaces pulse with a luminance distinction.
Color-blind palettes may change hues while preserving semantic names.

For threads owned by an app-server session, the protocol can provide thread
runtime status, turn lifecycle events, approval requests, user-input requests,
and failures. A separate app-server is **not** documented to observe live turns
running inside the ChatGPT desktop app's private process. Approval and input
state are known only for requests observed by this client; they are not a
documented queryable property of every persisted thread.

The host owns durable “completed/unread” acknowledgement because runtime
completion and whether this app's user has read it are different facts.

“Needs input” is only shown while a concrete pending request is known. The
integration does not infer it from conversational prose. “Selected task pulse”
is deferred until the standalone app can observe Codex's actual selected task;
working already uses pulse and must not be confused with selection.

Codex Micro uses pulse for the selected chat, not as its documented working or
needs-input effect. The Glove80 default deliberately adds pulse to blue working
and amber needs-input states because those states need attention and this app
cannot yet observe selection. The UI labels this as a Glove80 default, not a
first-party Codex default.

When facts overlap, presentation precedence is:

```text
stale/unavailable → error → needs input → working → completed/unread → idle
```

Stale wins because an expired snapshot is not trustworthy. Needs input wins
over working because it is the user's next actionable state.

## Press behavior

Outside the installed surface layer:

```text
press left 1 → type "1"
```

While the trigger is held:

```text
press left 1 → open/front the bound Codex task
```

The task identity and observed revision freeze at `MODE_ENTER`. At `KEY_DOWN`,
the adapter requires that same task identity and current action validity; an
unrelated revision change alone does not reject Open task. The action uses the
canonical local task deep link `codex://threads/<thread-id>` when supported. If
Codex or the task is unavailable, the app reports the reason in the HUD and
does not substitute another task.

Opening the task acknowledges an app-local completed/unread state. If a
first-party read/unread signal is later proven, that source becomes
authoritative.

v0 deliberately has:

- one press gesture;
- one action, **Open task**;
- no approve or decline key;
- no automatic command execution;
- no double-tap focus distinction; and
- no generic “run a Skill” binding.

Approval and decline are consequential contextual actions. They can be studied
later as explicit command bindings with a clear current-task target and
confirmation policy; they are not a safe default for a task-status key.

## What appears in the app and HUD

The canvas key shows its ordinary legend, a small Codex badge, live RGB preview,
and—when selected—the bound task title and state.

The inspector shows:

- stable task identity and mutable title;
- project/workspace;
- live semantic state and last update;
- current action availability;
- acknowledgement state;
- complete state preview strip; and
- connection, stale, deleted, or unsupported reasons.

The non-activating HUD shown while the trigger is held uses text:

```text
1  Release Glove80 Control Surface · Needs approval  → Open task
```

RGB communicates attention; the HUD communicates identity and action.

## Configuration scopes

### Application

- global surface brightness and pause;
- palette, reduced motion, no flash, and privacy mode;
- launch at login and menu-bar behavior.

### Codex integration

- connected Codex source, health, and the exact threads whose live events it
  owns or can observe;
- which local Codex source/workspaces are visible if the protocol exposes
  multiple sources;
- whether task titles may appear in the HUD and notifications.

### Per key

- specific task;
- Open task action;
- always or attention-only visibility;
- optional presentation override with Reset to Glove80 status default.

## Later, only after v0 evidence

Codex Micro demonstrates useful recent, pinned, priority, and custom source
modes. The Glove80 app may later offer a multi-key Codex region with those
strategies. That requires stable allocation, visible key-to-task mapping, and a
freeze for the entire interaction epoch. It is not necessary to prove the
single-task UX.

Codex Micro defaults to the six most recently updated chats and a three-minute
lighting timeout. Recent/priority regions, idle timeout, and wake-on-status may
inform later testing, but are not needed in v0.

Other later candidates are “new task and bind,” explicit approve/decline
command keys, selected-task indication, and additional safe Codex commands.
Each requires direct App Server evidence and its own action-safety decision.

## Remaining uncertainties

- **Primary feasibility gate:** whether a standalone process can observe live
  state for tasks currently running in the Codex desktop app. Official
  app-server documentation proves events within that server's client session,
  not attachment to the desktop app's private runtime.
- The official deep link opens a local thread. Other task sources are excluded
  until their navigation and live-state behavior are proven.
- The app-server documents thread and turn state, but the exact mapping for
  admitted tasks must be validated with recorded event traces.
- There may be no authoritative cross-client read acknowledgement. The v0
  fallback is explicitly app-local.
- Nested subagents appear in evolving app-server source metadata, but are not a
  stable user-facing binding identity for v0.
- The private Codex Micro integration does not prove that its exact chat
  selection or hardware APIs are available to this standalone application.
