# Glove80 Control Surface

Bind Glove80 keys to desktop integrations, actions, live states, colors, and
animations.

Glove80 Control Surface is an open-source project for turning a MoErgo Glove80
into a software control surface without giving up its normal keyboard layout.
Desktop integrations can attach live state and actions to physical keys.

> [!IMPORTANT]
> This repository is in the design and hardware-validation phase. It does not
> yet contain firmware that should be flashed. No release is currently
> installable.

## The idea

The product has two independent planes:

- **Ambient display:** selected keys can show live status while the keyboard is
  being used normally.
- **Momentary interaction:** holding a deliberate trigger temporarily makes
  those keys invoke their assigned actions.

Releasing the trigger always restores the normal keymap. If the desktop session
expires, temporary lighting clears and the interaction layer cannot capture new
presses.

Examples include agent tasks, calendar events, CI jobs, deployments,
notifications, media, and system controls. None of those concepts belong in
the firmware. They are host-side integrations using a generic control-surface
protocol.

## Product model

```text
Glove80 firmware
  ├── renders a leased scene across both 40-key halves
  ├── runs solid, pulse, and blink locally
  └── emits key down/up events in a momentary interaction layer

One macOS application
  ├── owns the USB HID session
  ├── stores bindings for every available RGB cell
  ├── runs built-in integrations
  ├── resolves semantic state into accessible visuals
  └── shows a labeled HUD while the interaction layer is held
```

See [Product model](docs/product.md), [Architecture](docs/architecture.md),
[User experience](docs/user-experience.md), and
[Desktop application plan](docs/application.md). The internal semantic boundary
is detailed in [Integration model](docs/integrations.md).

## Principles

1. **Normal typing is inviolable.** A crash or disconnect must not strand the
   keyboard in a control mode.
2. **Display and interaction are separate.** Status may remain glanceable while
   typing; only an explicit momentary trigger changes what a key press means.
3. **Firmware is generic.** It understands cells, events, scenes, effects, and
   sessions—not calendars, task systems, or individual applications.
4. **Bindings are dynamic.** Assigning an integration to a key must not require
   reflashing firmware.
5. **Animations run on the keyboard.** The host sends semantic effects instead
   of streaming RGB frames.
6. **Integrate narrowly.** Existing MoErgo/ZMK configuration remains the source
   of truth; arbitrary keymap source rewriting is not an initial promise.
7. **Flashing is explicit.** Builds are pinned and hashed, and recovery uses a
   previously saved or reproducibly rebuilt known-good artifact.
8. **No arbitrary remote ZMK execution.** The host cannot invoke reset,
   bootloader, bond deletion, or unrestricted firmware behaviors.

## Initial target

- MoErgo Glove80 with RGB
- macOS
- USB transport first
- all 80 RGB cells across both halves as the product target
- one macOS process with local configuration
- one built-in integration proving ambient state and one action
- solid, pulse, and blink
- a labeled on-screen HUD during momentary interaction

Implementation expands in measured steps: preserve the existing six-cell
experiment as a regression fixture, validate the complete 40-cell left frame,
then synchronize and validate the 40-cell right frame. A release for the
both-RGB Glove80 is not complete until all 80 cells are addressable. Bluetooth,
a public plugin SDK, and cross-platform support remain separate evidence-gated
expansions.

## Repository status

This initial repository intentionally contains specifications and decisions,
not an application skeleton. Technology choices should follow validated
requirements rather than quietly becoming requirements themselves.

- [Roadmap](docs/roadmap.md)
- [End-to-end user experience](docs/user-experience.md)
- [Desktop application and visual editor](docs/application.md)
- [Future-user needs](docs/user-needs.md)
- [Open design questions](docs/open-questions.md)
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
