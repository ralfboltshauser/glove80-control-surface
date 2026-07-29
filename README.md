# Glove80 Control Surface

Bind Glove80 keys to desktop plugins, actions, live states, colors, and
animations.

Glove80 Control Surface is an open-source project for turning a MoErgo Glove80
into a software control surface without giving up its normal keyboard layout.
A dedicated control layer makes physical keys interactive: desktop plugins can
attach actions to keys, report live state, and render per-key RGB feedback.

> [!IMPORTANT]
> This repository is in the design and hardware-validation phase. It does not
> yet contain firmware that should be flashed. No release is currently
> installable.

## The idea

Outside the control layer, the keyboard behaves exactly as configured by the
user. While the control layer is active:

- each bound key represents a plugin action or resource;
- pressing a key invokes that action;
- plugins update the key's color and animation as state changes;
- unbound keys remain dark or visibly unassigned; and
- a lost desktop connection automatically returns the keyboard to normal.

Examples include agent tasks, calendar events, CI jobs, deployments,
notifications, media, and system controls. None of those concepts belong in
the firmware. They are host-side plugins using a generic control-surface
protocol.

## Product model

```text
Glove80 firmware
  ├── preserves the user's normal ZMK keymap
  ├── exposes stable physical key/cell identifiers
  ├── emits control-layer key events
  ├── renders bounded per-cell colors and animations
  └── fails open to normal typing when the host lease expires

Desktop broker
  ├── owns the keyboard connection
  ├── dispatches key gestures to plugins
  ├── resolves state and visual priority
  └── sends atomic scenes to the keyboard

Desktop editor
  └── maps pages and keys to plugin actions and visual states

Plugins
  └── define actions, resources, states, and suggested visuals
```

See [Product model](docs/product.md), [Architecture](docs/architecture.md),
and [Plugin model](docs/plugin-model.md).

## Principles

1. **Normal typing is inviolable.** A crash or disconnect must not strand the
   keyboard in a control mode.
2. **Firmware is generic.** It understands cells, events, scenes, effects, and
   leases—not calendars, task systems, or individual applications.
3. **Bindings are dynamic.** Assigning a plugin to a key must not require
   reflashing firmware.
4. **Animations run on the keyboard.** The host sends semantic effects instead
   of streaming RGB frames.
5. **Import, do not replace.** Existing MoErgo JSON and ZMK keymap
   configuration remains the source of truth for normal keyboard behavior.
6. **Flashing is explicit and recoverable.** Builds are pinned and hashed;
   left/right artifacts are checked; rollback artifacts are retained.
7. **No arbitrary remote ZMK execution.** The host cannot invoke reset,
   bootloader, bond deletion, or unrestricted firmware behaviors.

## Initial target

- MoErgo Glove80 with RGB
- macOS
- USB transport first
- six fixed left-hand cells as the first hardware proof
- a standalone desktop broker and editor
- one reference plugin proving the generic plugin contract

The architecture models both 40-key halves from the start. Full left-side
coverage, right-side rendering, Bluetooth, and cross-platform support follow
after the smallest path is reliable.

## Repository status

This initial repository intentionally contains specifications and decisions,
not an application skeleton. Technology choices should follow validated
requirements rather than quietly becoming requirements themselves.

- [Roadmap](docs/roadmap.md)
- [Firmware boundary](docs/firmware.md)
- [Safety model](docs/safety.md)
- [ZMK command inventory](docs/research/zmk-command-inventory.md)
- [Architecture decisions](docs/decisions/)

## Contributing

Discussion, hardware observations, protocol review, and implementation
proposals are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a
pull request. Security-sensitive findings should follow [SECURITY.md](SECURITY.md).

## Project status and trademarks

Glove80 Control Surface is an independent, unofficial community project. It is
not affiliated with, endorsed by, or supported by MoErgo. Glove80 and MoErgo
are trademarks of their respective owners.

## License

[MIT License](LICENSE)
