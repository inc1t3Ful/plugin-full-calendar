# Changelog

Fork-local changelog. Tracks fixes accumulated on `personal/main`, our fork's build
branch (never merged upstream). Each entry corresponds to a commit cherry-picked
from its own `fix/google-*` branch. Fixes are numbered `#N` in the order they
were found — not the same as reading order below, since entries are grouped by
date (newest first).

## Why these are all one cluster

All seven fixes trace back to two goals: (1) toggle an event's display mode
(background/normal) back and forth, and (2) save recurring events through the
UI's full set of options (monthly, yearly, positional, daily). Both goals run
through the same underdeveloped subsystem — Google recurrence sync, display-mode
sync, and cache identity handling — and `type: 'rrule'` (how Google recurring
masters get parsed) turned out to be a second-class citizen across nearly every
layer that touches it. Fixing one bug in this area routinely exposed the next
one layer deeper:

1. **display-reminder-sync** — display mode had no Google field at all. Blocked
   goal 1 outright.
2. **ics-display-sync** — same display-mode gap, ICS path instead of Google.
3. **monthly-recurrence-sync** — `recurring`-type events never built RRULE for
   monthly/yearly/positional/daily. Blocked goal 2.
4. **instance-override-id** — single-instance edit/delete used the wrong Google
   API call (read-only field misuse).
5. **rrule-double-prefix** — `rrule`-type (Google-native master) edits got a
   malformed RRULE, silently reverting. Blocked toggling display back on a
   monthly recurring master specifically.
6. **edit-modal-uid-loss** — fixing #5 let the first edit through, which
   exposed the next bug: the cache lost `uid` on the `rrule`→`recurring` type
   swap that happens mid-edit, breaking every edit after the first.
7. **edit-modal-recurrence-hydration** — the edit modal's recurrence form only
   ever hydrated from `type: 'recurring'`, so reopening a Google-native
   recurring event showed its repeat settings as blank instead of reading them
   back out of its `rrule` string. Last bug in the cluster: no further layer
   left unhandled.

# 2026-09-11

## #7 fix/google-edit-modal-recurrence-hydration

**Bug:** Reopening the edit modal on a Google-native recurring event showed
"Repeats: None" and blank day/end-date fields, even though the event
genuinely recurred. Saving from that state risked silently downgrading the
event to a one-off.

Root cause: Google recurring masters parse as `type: 'rrule'`, but every
recurrence-field initializer in `EditEvent.tsx` (recurrence type, days of
week, monthly mode, end date, interval, "on the Nth weekday") only read from
`type: 'recurring'`. `type: 'rrule'` events carry their recurrence as a raw
`rrule` string instead, which none of these initializers ever looked at.

**Fix:** Added `parseRruleForUiFields()` (`src/types/rrule.ts`), the inverse
of the existing `getRecurringEventRule()`, which parses the `rrule` string via
the `rrule` library into the same recurrenceType/daysOfWeek/repeatOn/
repeatInterval/endRecur shape the form already used, and wired it into each
initializer as a fallback for `type: 'rrule'` events.

**Result:** Opening a Google-native recurring event for editing now shows its
actual recurrence settings instead of blank defaults.

## #6 fix/google-edit-modal-uid-loss

**Bug:** After editing a Google-native recurring event (e.g. toggling
display mode back to normal) once successfully, every subsequent edit to
that same event failed immediately with "Could not generate a persistent
handle for the event being modified."

Root cause: Google recurring master events are parsed as `type: 'rrule'`,
but the recurring-event edit UI always saves as `type: 'recurring'`.
`CacheMutationHandler.updateEventWithId`'s `uid`/`recurringEventId`/
`recurrenceId` preservation guard only fired for `single`->`single`
edits, so on this type transition the new event's missing `uid` was
written into the cache as-is. The first edit still succeeded (the
provider call uses the old, still-intact event to build its request),
but every edit after that read the now uid-less event back out of the
cache and failed to build a persistent handle.

**Fix:** Preserve `uid`/`recurringEventId`/`recurrenceId` from the old
event whenever missing on the new one, regardless of the type
combination, since these are provider-identity fields on the common
event schema, not state tied to a specific event type.

**Result:** Google-native recurring events can now be edited repeatedly
(display mode, recurrence, etc.) without losing their identity in the
cache.

## #5 fix/google-rrule-double-prefix

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

## #4 fix/google-instance-override-id

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

## #3 fix/google-monthly-recurrence-sync

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

# 2026-09-10

## #2 fix/ics-display-sync

**Bug:** The "display" mode set on an event (e.g. background/transparent)
did not persist through ICS import/export round-trips.

**Fix:** Encode/decode the display mode through the iCalendar representation
(`formatter.ts`), same property scheme used for Google sync.

**Result:** Display mode now survives ICS export and re-import.

## #1 fix/google-display-reminder-sync

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
