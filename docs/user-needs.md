# Future-user needs

The architecture exists to serve these jobs, not the other way around.

## Core jobs

### Glance

While typing normally, a user can tell whether something is working, finished,
stale, unavailable, needs input, or failed. Initial visibility policies are
always, attention-only, or hidden. Interaction-only presentation is added only
if it remains understandable without introducing a second scene model.

### Understand

Color alone is not identity. While the momentary interaction trigger is held,
the desktop shows a compact keyboard HUD with each bound key's label, source,
state, and available action.

### Act deliberately

A bound key may be:

- status-only;
- action-only; or
- status plus action.

The initial interaction is one safe tap action. Hold-to-confirm, multiple
gestures, and destructive actions are deferred until action feedback and
cancellation are proven.

### Trust and recover

The user must know:

- whether the desktop session is live;
- why a state is stale or unavailable;
- which integration has network or credential access;
- what firmware/configuration combination is installed; and
- how to return to a known-good firmware build.

The application never claims it can back up a running firmware image when the
hardware cannot provide one.

A menu-bar status shows connected, stale, paused, and incompatible states and
offers one-click pause/clear. Surface status is deliberately independent of the
ordinary underglow toggle while a live session exists; pausing the surface is
the explicit way to make it dark without changing the user's underglow choice.

### Configure without memorizing

An identify mode links hardware and editor: selecting a key in software lights
it, and pressing a surface key selects it in software. Exports omit secrets.
Because firmware topology does not contain the user's key legends, the editor
may import a MoErgo layout JSON as replaceable read-only display metadata. It
never rewrites or flashes that imported configuration.

## Accessibility

- User-selectable color-blind palettes.
- Reduced-motion and no-flash modes.
- Global brightness and battery-aware limits.
- Pattern or motion differences so color is never the only attention signal.
- Text labels in the runtime HUD.
- Critical needs-input and error states also use the HUD or a macOS
  notification; stationary RGB alone cannot be fully color-independent.
- A keyboard- and screen-reader-accessible editor when an editor is built.

## Representability

| Need | Minimal model |
| --- | --- |
| Fixed action with state | One binding with an action and state source |
| Passive indicator | Binding with no action |
| Command-only key | Binding with no state source |
| Fixed resource | Integration-owned fixed-resource source selector |
| Offline/stale state | `availability` and `expiresAt` in a snapshot |
| User visual preference | Binding-owned presentation override |
| Next meeting | One dynamic selector resolving to one frozen runtime tile |
| Dynamic task/event region | Later region provider yielding stable ordered tiles |
| Multiple pages/profiles | Deferred until one surface is understandable |
| Multiple computers | Active-endpoint ownership plus visible conflict state |

Dynamic collections must not be faked with permanent `slot-1` resource IDs.
A region provider may populate several cells using stable allocation and
hysteresis, and its mapping must freeze while the user is interacting so keys
do not change meaning under their hands.

## Hardware variation

Capabilities must represent available RGB cells honestly. The user's
both-RGB model targets 80 cells across two independently powered 40-cell
halves. A six-cell USB experiment proves only those six cells; it is a
regression fixture, not the product boundary. Left-only RGB, other revisions,
multiple keyboards, and non-RGB/action-only operation need their own
compatibility rows.

## Release bar

A generally useful release needs more than a successful USB experiment:

- guided and verified firmware installation/recovery;
- an understandable binding UI and HUD;
- accessible visual preferences;
- stale/offline behavior;
- a compatibility matrix;
- all 80 addressable cells on a supported both-RGB model; and
- Bluetooth for wireless-first Glove80 owners.
