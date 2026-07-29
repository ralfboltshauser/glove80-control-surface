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
  "resource": {"kind": "task", "id": "task-123"},
  "stateId": "working",
  "label": "Build release",
  "availability": "online",
  "actionAvailability": {"enabled": true},
  "revision": 42,
  "expiresAt": "2026-07-29T21:00:00Z"
}
```

A compiled `IntegrationDescriptor` may declare:

- source selector kinds;
- safe actions;
- semantic state IDs;
- suggested accessible presentations;
- required permissions and data scope; and
- whether it can later provide a dynamic collection.

Runtime state contains no firmware cell, effect, or priority. The binding and
user preferences resolve it into a presentation supported by the device.

## Initial limits

- Exactly two built-in source kinds:
  - Codex `fixedTask`;
  - Calendar `nextMeeting`.
- At most one safe tap action.
- Status-only and action-only bindings are allowed.
- No arbitrary third-party code loading.
- Neither v0 integration stores a service credential.
- Diagnostics redact resource labels and event/task content.

The application, not an integration, owns HID, firmware, visual priority,
brightness, accessibility, acknowledgement, and stale-state policy.

## Durable binding and runtime resolution

The common durable shape is:

```json
{
  "bindingId": "binding-1",
  "cell": 12,
  "integration": "calendar",
  "source": {
    "kind": "nextMeeting",
    "calendarIds": ["work"],
    "lookAheadMinutes": 120
  },
  "action": "smartOpen",
  "visibility": "always",
  "presentationOverride": null
}
```

`source` is validated and interpreted only by its built-in integration. The
core owns the envelope but does not pretend that every source is a fixed
resource.

At runtime the adapter produces:

```json
{
  "bindingId": "binding-1",
  "resource": {"kind": "event", "id": "event-9"},
  "stateId": "startingSoon",
  "availability": "online",
  "actionAvailability": {"enabled": true},
  "revision": 42,
  "observedAt": "2026-07-29T20:00:00Z",
  "expiresAt": "2026-07-29T20:01:00Z"
}
```

`resource` is nullable. A Calendar binding with no eligible meeting emits an
empty semantic state, disabled action availability, and `resource: null`.

The resolved resource identity and observed revision freeze at `MODE_ENTER`. At
`KEY_DOWN`, the integration requires that same resource identity and
revalidates current action availability. A harmless revision change does not by
itself reject an open action. If the event disappeared or the task became
unavailable, the action fails visibly; it never substitutes a different
resource during the interaction epoch.

Action availability is independent from semantic status. Action success or
failure appears in the HUD and application and does not temporarily overwrite
the resource's ambient state.

## Dynamic collections

Current tasks, upcoming meetings, and active jobs cannot be represented
honestly as permanent `slot-1` resources. A **region provider** yields an
ordered list of tiles for several cells.

The host allocates stable slots with hysteresis so ordinary polling does not
make resources jump between keys. It must freeze cell-to-resource mapping while
interaction mode is active. This is a later extension: Calendar's single
`nextMeeting` selector proves runtime resolution without requiring multi-cell
allocation in v0.

## Public SDK evidence gate

There is no public plugin SDK in v0. Codex and Calendar first exercise a fixed
resource, a time-driven selector, live state, expiry, acknowledgement, and safe
actions. The internal boundary is reviewed after both ship. A third integration
is added only if it answers a concrete unresolved contract question; plugin
isolation, packaging, permissions, versioning, and signing are not designed
speculatively.
