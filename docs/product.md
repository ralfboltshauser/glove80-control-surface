# Product model

## Problem

A keyboard already has a dense grid of tactile controls, but conventional
firmware treats each key primarily as a source of host keycodes. RGB effects
usually decorate the whole keyboard and do not represent live application
state.

Glove80 Control Surface adds an intentional second role: a temporary,
plugin-driven control surface whose keys are both actions and displays.

## Mental model

The user configures **pages**. A page maps physical keys to **bindings**. A
binding points to a plugin action and optionally a particular resource:

```json
{
  "page": "Development",
  "cell": "LH_C2R1",
  "plugin": "example.tasks",
  "action": "open",
  "resource": "task-slot-1"
}
```

The plugin publishes state for that binding. State resolves to a visual:

```json
{
  "state": "working",
  "visual": {
    "color": "#168BFF",
    "effect": "pulse",
    "periodMs": 1200
  }
}
```

Plugin visuals are defaults. Users may override them without modifying the
plugin.

## Interaction

1. The keyboard works normally.
2. The user holds a configured control-layer trigger.
3. Bound keys illuminate; unbound keys are dark or faint.
4. A key press invokes its binding.
5. The plugin updates the binding state.
6. Releasing the trigger restores normal typing and prior lighting.

A later version may support latching and multiple pages, but momentary
activation is the safest initial interaction.

## Core states are not mandatory

The platform may provide reusable visual conventions such as:

| Meaning | Suggested visual |
| --- | --- |
| idle | white, solid |
| working | blue, pulse |
| completed or unread | green, solid |
| needs input | amber, pulse |
| error | red, double blink |

Plugins remain free to define domain-specific states. The broker translates
plugin states into the bounded rendering vocabulary supported by the device.

## Non-goals

- Replacing the MoErgo layout editor.
- Encoding application-specific concepts in firmware.
- Executing arbitrary ZMK behaviors from desktop software.
- Requiring a flash whenever a plugin binding changes.
- Streaming decorative video-rate RGB frames over Bluetooth.
- Silently flashing or resetting a keyboard.
