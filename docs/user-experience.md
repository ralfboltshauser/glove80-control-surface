# User experience

## Core promise

A physical Glove80 key can represent live desktop state without losing its
normal typing behavior.

For example, a user can select the left-half `1` key in the application and
bind it to a specific Codex agent:

```text
physical left "1" key
    → firmware cell ID
    → host binding
    → Codex integration
    → selected agent
```

While the user types normally, the key continues to type `1`. Its LED
simultaneously presents the selected agent's state. In one possible theme:

| Agent state | Key presentation |
| --- | --- |
| idle | white, solid |
| working | white, pulse |
| completed and unread | green, solid |
| needs input | amber, pulse |
| failed | red, solid or blink |
| stale or unavailable | dim neutral presentation |

These presentations are defaults, not firmware meanings. The application
resolves semantic integration state into the user's selected palette,
brightness, reduced-motion, and no-flash preferences.

## Configure a binding

1. The user opens the keyboard editor.
2. The editor shows both 40-key halves using the firmware's topology identity.
3. The user selects the physical left `1` key.
4. The user selects the Codex integration.
5. The user chooses a particular agent and an optional safe action, such as
   opening its task.
6. The application saves the binding locally and previews the selected key.
7. The next complete scene sent to the keyboard includes that cell's resolved
   presentation.

Changing the agent, action, color, effect, or visibility does not require a
firmware flash. The keyboard stores no Codex identifiers or credentials.

## Glance without changing typing

Ambient display and key meaning are independent:

```text
normal mode:
    left "1" press → types "1"
    left "1" LED   → shows agent state
```

The application continuously observes the agent and sends a new complete scene
when its semantic state changes. The keyboard renders solid, pulse, or blink
locally. It does not receive continuous animation frames.

If the application disappears or its session expires, the temporary scene
clears and normal typing remains available.

## Act through the momentary surface

To invoke a binding, the user holds an explicitly configured physical
control-surface trigger:

```text
trigger held:
    left "1" press → cell event → application → bound Codex action

trigger released:
    left "1" press → types "1"
```

While the trigger is held, a desktop HUD is the leading discoverability design:
it labels bound keys, current targets, states, and actions. Its effectiveness
must be user-tested.

The firmware reports only the cell ID and interaction epoch. The application
uses the frozen binding map for that epoch to find the selected agent and
dispatch its action. Dynamic resources cannot move between cells during an
interaction.

The keyboard provides immediate local press feedback. The application then
updates the scene and HUD with accepted, completed, needs-input, or failed
feedback. Destructive actions require a future explicit confirmation design
and are excluded initially.

## Fixed and dynamic agent mappings

A fixed binding always represents one selected agent or task until the user
changes it.

A dynamic agent region assigns several keys to currently relevant agents. The
application uses stable allocation and hysteresis so agents do not jump between
keys during ordinary polling. Allocation freezes as soon as interaction begins.

Both models use the same firmware interface. They differ only in how the host
application chooses its cell-to-target bindings.

## Responsibility boundary

| Concern | Owner |
| --- | --- |
| Physical cell identity and available effects | Firmware |
| Safe temporary interaction layer | Firmware |
| Per-cell RGB rendering and both-half synchronization | Firmware |
| Codex connection and agent discovery | Codex integration |
| Cell-to-agent binding | Application |
| Semantic-state-to-presentation mapping | Application and user preferences |
| Action dispatch and durable unread state | Application/integration |
| Normal typing layout | Existing user keymap |

This boundary is generic: calendar events, CI jobs, deployments, media, and
other integrations use the same cells, scenes, and physical events without
adding application-specific concepts to firmware.

## Acceptance criteria

This experience is complete only when:

- selecting a key in the editor reliably identifies the same physical LED;
- every available cell on both supported RGB halves can be bound;
- ambient state never changes the key's normal meaning;
- entering interaction requires a deliberate physical gesture;
- release, application crash, session expiry, and disconnect restore ordinary
  behavior;
- the displayed target cannot move while the user is interacting;
- central and peripheral scene generations are visible to the application;
- stale, unavailable, paused, and incompatible states are understandable; and
- binding or presentation changes never require another flash.
