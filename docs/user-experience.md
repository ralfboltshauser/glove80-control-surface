# User experience

## Core promise

A physical Glove80 region can represent changing desktop resources without
losing normal typing behavior.

For example, a user selects several keys once and makes them a Priority Codex
task board:

```text
ordered physical cells
    → one host binding
    → Codex Priority source
    → stable task-to-cell allocation
```

While the user types normally, every key keeps its original meaning. Each LED
simultaneously presents the currently allocated task's state:

| Task state | Key presentation |
| --- | --- |
| idle | white, solid |
| working | blue, pulse |
| completed and unread | green, solid |
| needs input | amber, pulse |
| failed | red, solid |
| stale or unavailable | dim neutral presentation |

These presentations are defaults, not firmware meanings. The application
resolves semantic integration state into the user's selected palette,
brightness, reduced-motion, and no-flash preferences.

## Configure a binding

1. The user opens the keyboard editor.
2. The editor shows both 40-key halves using the firmware's topology identity.
3. The user selects an ordered region on either or both halves.
4. The user selects the Codex integration.
5. The default Priority task source automatically fills the region.
6. The application saves the binding locally and previews current allocation.
7. The next complete scene includes every allocated cell's presentation.

New tasks do not require settings changes or firmware flashes. Changing the
region, source strategy, action, appearance, or visibility also remains
host-only. The keyboard stores no Codex identifiers or credentials.

## Glance without changing typing

Ambient display and key meaning are independent:

```text
normal mode:
    left "1" press → types "1"
    left "1" LED   → shows task state
```

The application continuously observes the collection, preserves sticky slot
allocation, and sends a new complete scene when state or allocation changes.
The keyboard renders solid or pulse locally. It does not receive continuous
animation frames. Blink is not a baseline promise and remains conditional on
later accessibility and power evidence.

If the application disappears or its session expires, the temporary scene
clears and normal typing remains available.

## Act through the momentary surface

To invoke a binding, the user holds the firmware-installed physical
control-surface trigger:

```text
trigger held:
    left "1" press → cell event → application → bound Codex action

trigger released:
    left "1" press → types "1"
```

While the trigger is held, a desktop HUD is the leading discoverability design:
it labels bound keys, current resources, states, and actions. Its effectiveness
must be user-tested.

The firmware reports only the cell ID and interaction epoch. The application
uses the frozen allocation, resource identity, and observed revision for that
epoch to find the task or event and dispatch its action. Dynamic resources
cannot move between cells during an interaction.

The keyboard provides immediate local press feedback. The application then
updates the HUD with accepted, completed, cancelled, or failed action feedback
without overwriting the resource's semantic LED state. Destructive actions
require a future explicit confirmation design and are excluded initially.

## Collection and singleton mappings

A Codex task-board binding resolves an ordered candidate collection into a
sticky allocation across several cells. A Calendar binding resolves next
eligible meeting from selected calendars into zero or one tile on one cell.
An advanced fixed Codex binding remains available for exceptional long-lived
tasks.

The resolved resource identity and observed revision freeze as soon as
interaction begins. The adapter requires that same identity and current action
validity before acting, so a changing calendar cannot retarget the key under
the user's finger. A harmless revision update alone does not cancel the action.

Both models use the same firmware interface. They differ only in how the host
application resolves and allocates the source collection.

## Responsibility boundary

| Concern | Owner |
| --- | --- |
| Physical cell identity and available effects | Firmware |
| Safe temporary interaction layer | Firmware |
| Per-cell RGB rendering and both-half synchronization | Firmware |
| Codex connection and task discovery | Codex integration |
| Calendar permission and event resolution | Calendar integration |
| Ordered cells and stable slot allocation | Application |
| Semantic-state-to-presentation mapping | Application and user preferences |
| Action dispatch and durable unread state | Application/integration |
| Normal typing layout | Existing user keymap |

This boundary remains generic: future integrations can use the same cells,
scenes, and physical events without adding application-specific concepts to
firmware.

The concrete v0 behavior is specified in [Codex integration UX](integration-codex.md)
and [Calendar integration UX](integration-calendar.md).

## Acceptance criteria

This experience is complete only when:

- selecting a key in the editor reliably identifies the same physical LED;
- every available cell on both supported RGB halves can be bound;
- a Codex board may use any ordered subset across both halves;
- new tasks fill empty cells without settings changes;
- state changes do not cause continuous task reshuffling;
- active and needs-input tasks remain protected;
- error and completed/unread tasks remain protected until acknowledged;
- overflow is visible when protected tasks exceed the region;
- ambient state never changes the key's normal meaning;
- entering interaction requires a deliberate physical gesture;
- release, application crash, session expiry, and disconnect restore ordinary
  behavior;
- the displayed resource cannot move while the user is interacting;
- central and peripheral scene generations are visible to the application;
- stale, unavailable, paused, and incompatible states are understandable; and
- binding or presentation changes never require another flash.
