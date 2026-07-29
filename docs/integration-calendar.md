# Calendar integration UX

## Product promise

A Calendar-bound key represents the **next qualifying meeting** from calendars
chosen by the user. Its identity changes automatically, but its meaning does
not: “my next meeting for this calendar set.”

Examples:

```text
left 1 → next meeting from Work
left 2 → next meeting from Personal
left 3 → next meeting across Work + Personal
```

Multiple keys may use different or overlapping calendar sets. The editor warns
about overlap but does not forbid an intentional setup.

The intended v0 integration reads calendars already configured in macOS
Calendar, so iCloud, Google, Exchange, and CalDAV accounts share the Mac's
existing account and permission model. It promises ambient timing first.
Exact-event navigation and one-touch Join are capability-gated because EventKit
does not document Google-style conference entry points.

## v0 setup

1. The user enables **Calendar** in the integration rail.
2. The app explains why event access is needed, then asks macOS for permission.
3. The user clicks a physical Glove80 key.
4. The inspector shows:

```text
Integration       Calendar
Represents        Next meeting
Calendars         Work, Team
Look ahead        2 hours
Starting soon     10 minutes
When pressed      Open meeting
Visibility        Always
Appearance        Calendar default
```

Only the key and calendar set are required. Defaults provide the rest.
Calendars are grouped by account and retain their familiar names and colors in
the picker.

Core per-key options:

- one or more calendars;
- look-ahead window: 30 minutes, 1 hour, 2 hours (default), 4 hours, or today;
- starting-soon threshold: 5, 10 (default), 15, or 30 minutes;
- one action: **Open meeting**; and
- optional appearance override with Reset to Calendar default.

v0 hardcodes conservative eligibility policy rather than exposing a filter
builder: include tentative, unanswered, and unknown RSVP states; exclude
ordinary solo timed events.

The v0 has no timezone preference. Countdown math uses absolute event instants
and the Mac's current timezone; event details identify a different authored
timezone when relevant.

## What qualifies as a meeting

The default **Meetings** classifier is an initial hypothesis. It includes a
timed event with either:

- at least one other attendee; or
- structured conferencing information when the source exposes it.

It excludes:

- cancelled or declined events;
- all-day events and birthdays;
- working-location, out-of-office, and focus-time events when the source
  identifies their type; and
- ordinary solo blocks without attendees or conferencing.

Tentative, unanswered, unknown, or missing RSVP states remain visible rather
than silently hiding a meeting. The inspector explains why the current event
qualified.

Provider-specific status events are never inferred from their title. If
EventKit does not preserve an event's provider type, the integration cannot
promise to recognize it as focus time, out of office, or working location.

An event marked free may still be a real meeting and remains eligible.
Free/busy transparency affects conflict treatment, not basic meeting identity.
Missing or redacted titles appear as **Busy**; the app never invents or exposes
a title it did not receive. EventKit does not prove the provider's underlying
privacy classification.

Primary platform references:

- [Apple Calendar accounts](https://support.apple.com/guide/calendar/add-or-delete-calendar-accounts-icl4308d6701/mac)
- [Apple Calendar join behavior](https://support.apple.com/en-ie/guide/calendar/icl4307cb2b5/mac)
- [Apple EventKit event access](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoevents%28completion%3A%29)
- [Google Calendar event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Google Calendar status event types](https://developers.google.com/workspace/calendar/api/guides/calendar-status)

## Keyboard states

Calendar reuses the product-wide semantic language instead of assigning a new
meaning to green or red:

| Temporal state | Default presentation | Meaning |
| --- | --- | --- |
| Empty | off | no qualifying meeting in the look-ahead window |
| Later | dim white, solid | a meeting exists within the window |
| Starting soon | amber, pulse | starts within the configured threshold |
| In progress | blue, pulse | scheduled event time is underway |
| Stale | dim neutral | refresh failed, but cache is still inside its grace period |
| Error/unavailable | red, solid | permission failed or cache passed its grace period |

The sequence is:

```text
off → dim white → amber pulse → blue pulse → next event/off
```

Green is reserved for completed/unread attention elsewhere in the product; an
ended meeting needs no acknowledgement. Red is reserved for actual failures,
not ordinary schedule conflicts.

The app never claims that the user joined. Blue means only that the scheduled
time is in progress. Reduced-motion substitutes luminance for pulse, and the
HUD always supplies the textual meaning.

Presentation precedence is:

```text
error/unavailable → stale → in progress → starting soon → later → empty
```

Expired data never retains an apparently authoritative countdown.

If blocking meetings overlap, the key keeps the temporal state of one
deterministic primary event and the canvas, menu status, and HUD show the
conflict count. In-progress candidates sort by latest start first; future
candidates sort by earliest start first. Ties use the order shown in the
calendar picker, then a stable occurrence identity. The HUD identifies the
exact event that will open before the press. A future chooser may replace this
after testing; v0 never encodes conflict as an unexplained red error.

## Press behavior

Normal typing is unchanged outside the surface layer. While the trigger is
held, the binding's currently resolved event identity and observed revision
freeze.

**Open meeting** has a capability ladder:

1. Join only if the source exposes a structured conference entry point and that
   exact provider path has passed compatibility tests.
2. Otherwise show the exact event in Calendar only if stable identifier mapping
   and Calendar automation have passed compatibility tests.
3. Otherwise open Calendar at the event's date if Calendar automation is
   available.
4. Otherwise only launch Calendar.

With no event or broken access, the action is disabled and the HUD explains
why. Repair is an explicit button in the app, not a hidden fallback key action.

At key down, the adapter requires the same event identity and revalidates
current action availability against the latest locally available snapshot. If
cancellation or invalidation is visible, it reports that fact and refreshes
after interaction ends; it does not silently act on the new “next meeting.”
This does not claim an immediate remote refresh, and an unrelated revision
change alone does not reject a safe open action.

The actual Calendar app scripting dictionary on the development Mac exposes a
read-only event `uid`, an event `url`, `show` for an event, and `view calendar
at` a date. This proves candidate Calendar automation commands, not that an
EventKit identifier maps reliably to the scripting `uid` across providers or
that the event URL is a conference URL. Those mappings require a compatibility
spike and may require macOS Automation permission.

Reproduce the descriptor observation without opening or changing Calendar:

```sh
sdef /System/Applications/Calendar.app
```

v0 never scrapes arbitrary links from notes, creates or edits events, changes
RSVP, infers attendance, or controls microphone/camera state.

## What appears in the app and HUD

A selected Calendar key on the canvas shows:

```text
Calendar badge
Work next meeting
Design review · 10:00
Starts in 18 min
```

The inspector shows:

- selected calendars and deterministic tie-break order;
- the currently resolved event;
- start, end, countdown, and timezone;
- observed RSVP state and whether the title is redacted;
- the proven action capability: Join, Show event, Open Calendar, or disabled;
- why the event qualified;
- freshness and expiry;
- the complete state preview strip; and
- a textual explanation for empty, stale, conflict, or error states.

The non-activating HUD shown while the trigger is held says, for example:

```text
1  Design review · starts in 8 min  → Join
```

or:

```text
1  Design review · +1 conflict  → Open event
```

RGB communicates time and attention. Text communicates event identity,
conflict, privacy, and exact action.

## Privacy and permissions

The permission explanation is:

> Calendar access lets this app find upcoming meetings and open their event or
> call link when the selected calendar source exposes a proven route. It does
> not create, edit, accept, decline, or delete events.

macOS may describe the required EventKit permission as full event access even
though this product performs no Calendar writes. The app must explain that
distinction rather than claiming the operating-system grant itself is
read-only.

Privacy defaults:

- request Calendar permission only when the integration is enabled;
- keep event data local;
- send the keyboard only cell presentation data;
- never write titles, attendee lists, descriptions, or call secrets to
  firmware;
- do not show meeting-title notifications by default;
- privacy mode replaces titles with **Meeting** or **Busy** in the app and HUD;
  and
- removing a binding never changes the calendar or account.

## Edge policy

- Back-to-back events switch at the first event's scheduled end.
- Cancelled and declined events disappear when that state is visible in the
  current source snapshot.
- Known all-day, birthday, and identified calendar-status events remain
  excluded.
- Recurring instances are evaluated individually.
- Duplicate copies are collapsed only when a stable identifier plus occurrence
  start proves they are the same meeting.
- Identity-dependent actions are disabled whenever the observed source exposes
  only redacted busy time, regardless of its provider-specific access role.
- Recently cached data may remain visible only for a short documented grace
  period and is marked stale; expired data cannot present an authoritative
  countdown indefinitely.
- Timezone changes recompute immediately from absolute instants.
- A meeting without a proven Join or exact-event path opens Calendar at its
  date.

## Explicitly outside v0

- creating or editing events;
- RSVP actions;
- independent reminder notifications;
- arbitrary filter builders;
- organizer- or attendee-based color rules;
- URL scraping from free-form descriptions;
- focus-time, out-of-office, or working-location controls;
- double-tap or long-press gestures;
- attendance detection; and
- an agenda region spanning several keys.

## Remaining uncertainties

- EventKit access and the event fields preserved for Google, Exchange, CalDAV,
  Zoom, Teams, and Meet must be measured on real configured accounts.
- Public EventKit does not expose Google `conferenceData`. Join requires a
  separately proven provider capability.
- Mapping an EventKit occurrence to Calendar's scripting `show` command is
  unproven. The honest baseline is opening Calendar at the event date.
- The stale grace period is a starting hypothesis that needs user testing.
- Cross-calendar duplicate detection is possible only when stable provider data
  survives EventKit.
