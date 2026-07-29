# ZMK command inventory

This inventory separates commands by direction. Supporting RGB effects does
not imply host-addressable, per-key runtime control.

## Host to stock ZMK

- Standard HID LED output: Num Lock, Caps Lock, Scroll Lock, Compose, and Kana.
- ZMK Studio RPC: device/lock information, behavior metadata, and dynamic
  keymap/layout editing.
- No stock command remotely invokes an arbitrary behavior.
- No stock command sends a per-key RGB scene.

Primary references:

- [ZMK behavior overview](https://zmk.dev/docs/keymaps/behaviors)
- [ZMK RGB underglow behavior](https://zmk.dev/docs/keymaps/behaviors/underglow)
- [ZMK Studio RPC protocol](https://zmk.dev/docs/development/studio-rpc-protocol)
- [ZMK LED indicators](https://zmk.dev/docs/features/led-indicators)

## Key-bound ZMK behaviors

Behavior families include key and consumer output, hold-tap, layers, mouse
emulation, Bluetooth profile management, output routing, lighting, power,
reset/bootloader, Studio unlock, macros, tap dance, mod-morph, and sensor
rotation.

These are firmware behaviors triggered by positions, combos, sensors, or other
behaviors. They are not automatically a desktop-facing API.

## RGB commands

Upstream-style underglow commands control the whole strip:

```text
RGB_ON RGB_OFF RGB_TOG
RGB_HUI RGB_HUD
RGB_SAI RGB_SAD
RGB_BRI RGB_BRD
RGB_SPI RGB_SPD
RGB_EFF RGB_EFR
RGB_COLOR_HSB
```

The MoErgo fork additionally implements `RGB_STATUS`, a temporary diagnostic
overlay for batteries, locks, layers, Bluetooth profiles, USB, and output
fallback:

- [MoErgo RGB source](https://github.com/moergo-sc/zmk/blob/main/app/src/rgb_underglow.c)
- [MoErgo RGB command definitions](https://github.com/moergo-sc/zmk/blob/main/app/include/dt-bindings/zmk/rgb.h)
- [Glove80 indicator documentation](https://docs.moergo.com/glove80-user-guide/typing-with-glove80/)

## Pixel driver

Each RGB-equipped Glove80 half defines a 40-pixel WS2812 strip. Firmware
ultimately provides an independent RGB value for every pixel to Zephyr's LED
strip API. Per-pixel control is therefore possible inside firmware; the missing
stock capability is a bounded host transport and ownership model.

## Split transport

The left central can poll events, invoke a named behavior with two 32-bit
parameters, set a physical layout, and propagate HID indicators. This is enough
for compact semantic state but not designed as a 40-pixel framebuffer stream.

The project should add a dedicated semantic scene path for right-side rendering
rather than exposing generic behavior invocation to the desktop.
