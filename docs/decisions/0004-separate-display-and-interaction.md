# ADR 0004: Separate ambient display from interaction

- Status: Accepted
- Date: 2026-07-29

## Context

The primary value is glanceable state while the user continues typing. Changing
what a key press means requires a separate, deliberate mode. Treating both as
one temporary layer hides useful state and creates ambiguous key behavior.

## Decision

Ambient lighting may remain active during normal typing according to each
binding's visibility policy. Key presses become integration actions only while
one momentary interaction trigger is held and a live desktop session exists.

## Consequences

- Status remains visible without a gesture.
- An illuminated key still performs its normal typing function unless
  interaction mode is held.
- A runtime HUD is the leading discoverability hypothesis for labeling actions;
  it must be validated with users rather than assumed sufficient.
- Firmware maintains separate display-session and interaction-mode state.
- Latching and multiple pages are deferred.
