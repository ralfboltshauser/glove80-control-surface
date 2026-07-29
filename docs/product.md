# Product model

## Problem

A keyboard already has a dense grid of tactile controls, but conventional
firmware treats each key primarily as a source of host keycodes. RGB effects
usually decorate the whole keyboard and do not represent live application
state.

Glove80 Control Surface adds two optional roles:

- an ambient display that remains glanceable during normal typing; and
- a momentary interaction surface entered through a deliberate trigger.

These roles are independent. A key can show state without changing its normal
typing behavior until interaction mode is held.

## Minimal nouns

- **Surface:** the available hardware cells. There is one surface initially.
- **Binding:** assigns an integration-owned source selector and optional action
  to one cell.
- **Resolved tile:** the source's current optional resource, semantic state, label,
  action availability, revision, and expiry.
- **Presentation:** the accessible color/effect resolved by user policy and
  integration defaults.

```json
{
  "cell": 2,
  "integration": "codex",
  "source": {"kind": "fixedTask", "threadId": "task-123"},
  "action": "openTask",
  "visibility": "always"
}
```

The integration resolves that selector and emits semantic data, not final
hardware priority:

```json
{
  "stateId": "working",
  "resourceId": "task-123",
  "label": "Build release",
  "availability": "online",
  "actionAvailability": {"enabled": true},
  "revision": 42,
  "expiresAt": "2026-07-29T21:00:00Z"
}
```

The integration may suggest default presentations. The user's binding/theme
owns overrides, priority, reduced motion, and brightness.

The source selector is intentionally opaque to the application core. A Codex
binding can select one stable task; a Calendar binding can select the next
eligible event from a set of calendars. The resolved resource is frozen for an
interaction epoch and revalidated before action dispatch. It cannot silently
change between the user seeing a key and pressing it.

The resource may be null, for example when a Calendar binding has no eligible
meeting. In that state its action is disabled.

The canonical end-to-end binding and interaction journey is specified in
[User experience](user-experience.md).

## Interaction

1. The keyboard works normally.
2. Ambient bindings may show state without intercepting keys.
3. The user holds one configured, momentary interaction trigger.
4. The desktop HUD labels the currently bound controls.
5. A surface-key press invokes its binding instead of its normal key behavior.
6. Releasing the trigger restores normal typing and prior lighting.

Interaction mode is available only while a live desktop session exists.
Latching and pages are deliberately excluded from the first version.

## Core states are not mandatory

The platform may provide reusable visual conventions such as:

| Meaning | Suggested visual |
| --- | --- |
| idle | white, solid |
| working | blue, pulse |
| completed or unread | green, solid |
| needs input | amber, pulse |
| error | red, solid |

Integrations remain free to define domain-specific states. The application
translates them into the bounded rendering vocabulary supported by the device.

## State lifetimes

Three lifetimes must not be conflated:

- the firmware session/scene lease, which always expires;
- live integration state, which becomes stale at `expiresAt`; and
- durable acknowledgement such as “completed but unread,” which is host data
  and may survive an integration restart.

## Non-goals

- Replacing the MoErgo layout editor.
- Multiple pages in the first product.
- Loading arbitrary third-party integration code in the first product.
- Encoding application-specific concepts in firmware.
- Executing arbitrary ZMK behaviors from desktop software.
- Requiring a flash whenever an integration binding changes.
- Rewriting every possible devicetree/C-preprocessor keymap automatically.
- Streaming decorative video-rate RGB frames over Bluetooth.
- Silently flashing or resetting a keyboard.
