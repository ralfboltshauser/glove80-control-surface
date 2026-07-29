# Plugin model

## Purpose

Plugins translate external application state into actions and visuals. The
firmware and broker remain application-agnostic.

## Conceptual contract

```ts
interface ControlPlugin {
  manifest: PluginManifest
  actions(): Promise<ActionDefinition[]>
  invoke(binding: Binding, gesture: Gesture): Promise<void>
  subscribe(
    binding: Binding,
    emit: (state: PluginState) => void
  ): Promise<Unsubscribe>
}

interface PluginState {
  id: string
  label?: string
  visual: {
    color: string
    effect: "solid" | "pulse" | "blink" | "double-blink" | "chase"
    periodMs?: number
    priority?: number
  }
}
```

This is a design sketch, not a committed TypeScript API.

## Isolation

- Plugins do not open HID devices.
- Plugins do not build or flash firmware.
- Plugins receive only the credentials and permissions they declare.
- The broker validates colors, effects, timing, and priority.
- A stopped or crashed plugin yields an expired/unknown state instead of
  retaining a misleading success state.

## Binding cardinality

The first version should permit one primary binding per cell per page. A plugin
may aggregate many underlying resources into that binding. More complicated
composition can be added only after the interaction remains understandable.

## State ownership

Plugins define semantic states and suggested visuals. The user may override
visuals. The broker owns conflict resolution and expiry. Firmware owns final
electrical and safety limits.
