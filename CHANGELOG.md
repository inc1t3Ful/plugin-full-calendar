# Changelog

Fork-local changelog. Tracks fixes accumulated on `personal/main`, our fork's build
branch (never merged upstream). Each entry corresponds to a commit cherry-picked
from its own `fix/google-*` branch.

## 2026-09-11 - fix/google-rrule-double-prefix

**Bug:** Any edit to a Google-sourced recurring master event (title, time,
display mode, etc.) appeared to apply for a moment, then silently reverted
with no visible error. Non-recurring events were unaffected.

Root cause: `fromGoogleEvent` stores `rrule.toString()` verbatim, which
already includes an `RRULE:` prefix (the convention `interop.ts` relies on
for local FullCalendar rendering). `toGoogleEvent`'s `rrule`-type branch
unconditionally prepended another `RRULE:` prefix, producing a malformed
`RRULE:RRULE:...` recurrence line on every PUT/PATCH back to Google. Google
rejects the malformed request, and `CacheMutationHandler` rolls the local
cache back to its prior state on failure — hence the "reverts silently"
symptom. Pre-existing since the original two-way sync implementation,
unrelated to the other Google fixes on this fork.

**Fix:** Strip any existing `RRULE:` prefix from `event.rrule` before
re-adding it in `toGoogleEvent`.

**Result:** Edits to Google-sourced recurring master events (including
toggling display mode) now persist correctly instead of silently rolling
back.

## 2026-09-11 - fix/google-instance-override-id

**Bug:** Deleting or moving a single instance of a recurring Google event did
nothing on Google's side. Obsidian's local view updated (event disappeared),
but the real event stayed on Google Calendar unchanged. No error shown.

Root cause: `cancelInstance` / `createInstanceOverride` POSTed a new event with
`recurringEventId` set. That field is read-only on Google's API — `events.insert`
silently ignores it, so the POST just created an orphan event instead of
attaching an exception to the series.

**Fix:** Compute Google's synthesized instance id
(`{masterEventId}_{originalStartTimeBasicFormat}`) and `PATCH` that instance
directly (`status: cancelled` for delete, full event body for override),
instead of POSTing a new standalone event.

**Result:** Deleting/moving a single occurrence of a Google recurring event
now correctly cancels/overrides that instance on Google's side. Also lifted
the old hardcoded block on overriding a single instance of an all-day
recurring event, since the corrected approach handles timed and all-day
instances the same way.

## 2026-09-11 - fix/google-monthly-recurrence-sync

**Bug:** Creating/editing a Google event with monthly, yearly, positional
(e.g. "third Tuesday"), or daily recurrence silently produced wrong or no
recurrence on Google's side, despite these options existing in the UI.

Root cause: `toGoogleEvent`'s recurrence branch only handled the `rrule`
event type; the `recurring` event type (used by the UI's frequency dropdown)
had no RRULE construction for monthly/yearly/positional/daily — those cases
were never implemented.

**Fix:** Added RRULE construction for monthly/yearly/positional/daily
recurrence in `toGoogleEvent`, matching the recurrence options already
present in the UI.

**Result:** Monthly, yearly, positional, and daily recurring Google events
now sync with the correct RRULE instead of silently failing.

## 2026-09-10 - fix/ics-display-sync

**Bug:** The "display" mode set on an event (e.g. background/transparent)
did not persist through ICS import/export round-trips.

**Fix:** Encode/decode the display mode through the iCalendar representation
(`formatter.ts`), same property scheme used for Google sync.

**Result:** Display mode now survives ICS export and re-import.

## 2026-09-10 - fix/google-display-reminder-sync

**Bug:** An event's display mode and reminders/alarms did not persist
correctly when synced to/from Google Calendar. Clearing all reminders,
in particular, did not clear them on Google's side.

Root cause: `toGoogleEvent` omitted the `reminders` field when an event had
no alarms, which makes Google fall back to the calendar's default reminders
instead of an explicitly empty list. Display mode had no corresponding
field sent to Google at all.

**Fix:** Always send an explicit `reminders` object (with `useDefault: false`),
even when empty. Store display mode in `extendedProperties.private`, sending
the key explicitly (including as an empty string) so a reset isn't shadowed
by a stale value on Google's copy.

**Result:** Display mode and reminder state now sync correctly and
deterministically in both directions with Google Calendar.
