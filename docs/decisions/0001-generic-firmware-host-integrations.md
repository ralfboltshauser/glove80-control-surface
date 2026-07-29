# ADR 0001: Generic firmware, host-side integrations

- Status: Accepted
- Date: 2026-07-29

## Context

Application-specific state changes frequently, while keyboard firmware updates
are comparatively disruptive. Encoding applications or their states in
firmware would couple releases and require unnecessary flashing.

## Decision

Firmware exposes generic cells, key events, rendering primitives, capabilities,
and sessions. Application integrations remain on the host. Key-to-integration
bindings are stored by the desktop application.

## Consequences

- New integrations and bindings do not require firmware changes.
- A host application is required for integration state.
- Firmware remains useful to applications not known when it was built.
- The application must resolve integration conflicts and stale state.
