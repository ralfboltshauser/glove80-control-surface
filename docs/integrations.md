# Integration model

## Purpose

Integrations translate external application state into semantic snapshots and
safe actions. The firmware remains application-agnostic.

The first integrations are built into the desktop application. This document is
an internal boundary, not a public plugin SDK commitment.

## Conceptual data

```json
{
  "bindingId": "binding-1",
  "availability": "online",
  "tiles": [
    {
      "resource": {"kind": "task", "id": "task-123"},
      "stateId": "working",
      "label": "Build release",
      "actionAvailability": {"enabled": true},
      "retention": "protected",
      "revision": 42
    }
  ],
  "expiresAt": "2026-07-29T21:00:00Z"
}
```

A compiled `IntegrationDescriptor` may declare:

- source selector kinds;
- safe actions;
- semantic state IDs;
- suggested accessible presentations;
- required permissions and data scope; and
- collection and retention policy.

Runtime state contains no firmware cell, effect, or priority. The binding and
user preferences resolve it into a presentation supported by the device.

## Initial limits

- One shipping integration and one evidence-gated integration:
  - Codex `taskBoard`;
  - Calendar `nextMeeting`, only if its bounded platform spike passes.
- At most one safe tap action per resolved tile.
- Status-only and action-only bindings are allowed.
- No arbitrary third-party code loading.
- Neither v0 integration stores a service credential.
- Diagnostics redact resource labels and event/task content.
- A normal Codex binding contains no fixed thread ID. Fixed-task assignment is
  not exposed in v0.

The application, not an integration, owns HID, firmware, visual priority,
brightness, accessibility, acknowledgement, and stale-state policy.

## Durable binding and runtime resolution

The common durable shape is:

```json
{
  "bindingId": "binding-1",
  "cells": [12],
  "integration": "calendar",
  "source": {
    "kind": "nextMeeting",
    "calendarIds": ["work"],
    "lookAheadMinutes": 120
  },
  "action": "openMeeting",
  "visibility": "always",
  "presentationOverride": null
}
```

`source` is validated and interpreted only by its built-in integration. The
core owns the envelope but does not pretend that every source is a fixed
resource.

At runtime the adapter produces a collection:

```json
{
  "bindingId": "binding-1",
  "availability": "online",
  "tiles": [
    {
      "resource": {"kind": "event", "id": "event-9"},
      "stateId": "startingSoon",
      "actionAvailability": {"enabled": true},
      "retention": "normal",
      "revision": 42
    }
  ],
  "observedAt": "2026-07-29T20:00:00Z",
  "expiresAt": "2026-07-29T20:01:00Z"
}
```

A Calendar binding with no eligible meeting or an empty Codex board emits
`tiles: []`. Unallocated cells have no action.

The resolved resource identity and observed revision freeze at `MODE_ENTER`. At
`KEY_DOWN`, the integration requires that same resource identity and
revalidates current action availability. A harmless revision change does not by
itself reject an open action. If the event disappeared or the task became
unavailable, the action fails visibly; it never substitutes a different
resource during the interaction epoch.

Action availability is independent from semantic status. Action success or
failure appears in the HUD and application and does not temporarily overwrite
the resource's ambient state.

## Stable collection allocation

A source yields an ordered collection of tiles for its binding's ordered cells.
Calendar produces zero or one. A Codex task board produces many.

The integration may suggest candidate order and `protected` or `normal`
retention, but it never chooses physical cells. The host:

1. preserves an existing resource-to-cell assignment while it remains
   eligible;
2. fills empty cells in binding order;
3. replaces only eligible normal-retention tiles when a higher-priority
   candidate needs space;
4. exposes overflow rather than continuously reshuffling; and
5. freezes the complete allocation during interaction.

This allocation is required for the Codex v0 rather than deferred platform
machinery.

## Public SDK evidence gate

There is no public plugin SDK in v0. Codex and Calendar first exercise a
dynamic collection, a time-driven singleton, live state, expiry,
acknowledgement, retention, and safe actions. The internal boundary is reviewed
after both ship. A third integration is added only if it answers a concrete
unresolved contract question; plugin isolation, packaging, permissions,
versioning, and signing are not designed speculatively.
