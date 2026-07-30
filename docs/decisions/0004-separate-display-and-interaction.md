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
the one-shot Control layer is armed and a live desktop lease exists. Magic+1
arms one action; the same chord cancels. Releasing an action key, five-second
inactivity, five-second maximum hold, expiry, or close exits without another
action. Hold timeout emits a matching Up before exit.

## Consequences

- Status remains visible without a gesture.
- An illuminated key still performs its normal typing function unless
  interaction mode is armed.
- A runtime HUD is the leading discoverability hypothesis for labeling actions;
  it must be validated with users rather than assumed sufficient.
- Firmware maintains separate display-session and interaction-mode state.
- Latching and multiple pages are deferred.
