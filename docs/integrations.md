# Integration model

## Purpose

Integrations translate external application state into semantic snapshots and
safe actions. The firmware remains application-agnostic.

The first integrations are built into the macOS application. This document is
an internal boundary, not a public plugin SDK commitment.

## Conceptual data

```json
{
  "bindingId": "binding-1",
  "stateId": "working",
  "label": "Build release",
  "availability": "online",
  "expiresAt": "2026-07-29T21:00:00Z"
}
```

An integration manifest may declare:

- selectable fixed targets;
- safe actions;
- semantic state IDs;
- suggested accessible presentations;
- required credentials and network origins; and
- whether it can later provide a dynamic collection.

Runtime state contains no firmware cell, effect, or priority. The binding and
user preferences resolve it into a presentation supported by the device.

## Initial limits

- One fixed target per binding.
- At most one safe tap action.
- Status-only and action-only bindings are allowed.
- No arbitrary third-party code loading.
- Credentials use the system credential store and are excluded from exports.
- Diagnostics redact resource labels and credentials.

The application, not an integration, owns HID, firmware, visual priority,
brightness, accessibility, acknowledgement, and stale-state policy.

## Dynamic collections

Current agents, upcoming meetings, and active jobs cannot be represented
honestly as permanent `slot-1` resources. A **region provider** yields an
ordered list of tiles for several cells.

The host allocates stable slots with hysteresis so ordinary polling does not
make resources jump between keys. It must freeze cell-to-resource mapping while
interaction mode is active. A fixed binding ships first, but at least one
dynamic provider is a pre-release product milestone rather than a future SDK
feature.

## Public SDK evidence gate

A public plugin contract is designed only after at least three built-in
integrations demonstrate different shapes:

1. fixed resource with state and action;
2. command-only control; and
3. dynamic or aggregate state.

Only then can isolation, packaging, permissions, versioning, and signing be
specified from evidence rather than prediction.
