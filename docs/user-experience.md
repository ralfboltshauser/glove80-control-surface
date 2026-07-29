# User experience

## Core promise

A physical Glove80 key can represent live desktop state without losing its
normal typing behavior.

For example, a user can select the left-half `1` key in the application and
bind it to a specific Codex task:

```text
physical left "1" key
    → firmware cell ID
    → host binding
    → Codex integration
    → selected task
```

While the user types normally, the key continues to type `1`. Its LED
simultaneously presents the selected task's state. In one possible theme:

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
3. The user selects the physical left `1` key.
4. The user selects the Codex integration.
5. The user chooses a particular task and an optional safe action, such as
   opening its task.
6. The application saves the binding locally and previews the selected key.
7. The next complete scene sent to the keyboard includes that cell's resolved
   presentation.

Changing the task, action, color, effect, or visibility does not require a
firmware flash. The keyboard stores no Codex identifiers or credentials.

## Glance without changing typing

Ambient display and key meaning are independent:

```text
normal mode:
    left "1" press → types "1"
    left "1" LED   → shows task state
```

The application continuously observes the task and sends a new complete scene
when its semantic state changes. The keyboard renders solid, pulse, or blink
locally. It does not receive continuous animation frames.

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
uses the frozen resolved resource and revision for that epoch to find the task
or event and dispatch its action. Dynamic resources cannot move between cells during an
interaction.

The keyboard provides immediate local press feedback. The application then
updates the HUD with accepted, completed, cancelled, or failed action feedback
without overwriting the resource's semantic LED state. Destructive actions
require a future explicit confirmation design and are excluded initially.

## Fixed and resolved mappings

A fixed Codex binding always represents one selected task until the user
changes it. A Calendar binding represents a selector—next eligible meeting
from selected calendars—and resolves to a specific event at runtime.

The resolved resource identity and observed revision freeze as soon as
interaction begins. The adapter requires that same identity and current action
validity before acting, so a changing calendar cannot retarget the key under
the user's finger. A harmless revision update alone does not cancel the action.

A later dynamic region may assign several keys to currently relevant tasks or
events. It would use stable allocation and hysteresis, but is not part of v0.

Both models use the same firmware interface. They differ only in how the host
application resolves the source selector for a cell.

## Responsibility boundary

| Concern | Owner |
| --- | --- |
| Physical cell identity and available effects | Firmware |
| Safe temporary interaction layer | Firmware |
| Per-cell RGB rendering and both-half synchronization | Firmware |
| Codex connection and task discovery | Codex integration |
| Calendar permission and event resolution | Calendar integration |
| Cell-to-source binding | Application |
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
- ambient state never changes the key's normal meaning;
- entering interaction requires a deliberate physical gesture;
- release, application crash, session expiry, and disconnect restore ordinary
  behavior;
- the displayed resource cannot move while the user is interacting;
- central and peripheral scene generations are visible to the application;
- stale, unavailable, paused, and incompatible states are understandable; and
- binding or presentation changes never require another flash.
