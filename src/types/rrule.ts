/**
 * @file rrule.ts
 * @brief Standalone utility functions for handling RRule logic.
 *
 * @description
 * This file centralizes the creation and manipulation of RRule objects and strings
 * from OFCEvents. It ensures that the logic for generating iCalendar-compliant
 * recurrence rules is consistent across the plugin.
 *
 * @license See LICENSE.md
 */

import { RRule, rrulestr, ByWeekday } from 'rrule';
import { DateTime } from 'luxon';

// Define a specific type for the data these functions operate on.
// This avoids issues with the broader OFCEvent union type.
export type RecurringEventData = {
  daysOfWeek: string[];
  startRecur: string;
  endRecur?: string;
};

/**
 * Creates an RRule object from recurring event properties.
 * @param event The recurring event data.
 * @returns An RRule object or null if the event data is invalid.
 */
export function getRruleFromEvent(event: RecurringEventData): RRule | null {
  if (!event.startRecur || !event.daysOfWeek || event.daysOfWeek.length === 0) {
    return null;
  }

  const weekdays = {
    U: RRule.SU,
    M: RRule.MO,
    T: RRule.TU,
    W: RRule.WE,
    R: RRule.TH,
    F: RRule.FR,
    S: RRule.SA
  };
  const byday = event.daysOfWeek.map(c => weekdays[c as keyof typeof weekdays]);

  // RRule constructor expects a native Date object.
  // We parse the ISO string and create a Date at UTC midnight to avoid timezone shifts.
  const dtstart = new Date(event.startRecur);

  let until: Date | null = null;
  if (event.endRecur) {
    // Set 'until' to be the end of the specified day.
    until = DateTime.fromISO(event.endRecur).endOf('day').toJSDate();
  }

  return new RRule({
    freq: RRule.WEEKLY,
    byweekday: byday,
    dtstart,
    until
  });
}

/**
 * Calculates the first occurrence of a recurring event.
 * @param event The recurring event data.
 * @returns A Luxon DateTime object of the first occurrence, or null.
 */
export function getFirstOccurrence(event: RecurringEventData): DateTime | null {
  const rule = getRruleFromEvent(event);
  if (!rule) return null;

  // The `after` method with `inc=true` finds the first date that matches the rule,
  // including the start date itself.
  const first = rule.after(rule.options.dtstart, true);
  return first ? DateTime.fromJSDate(first) : null;
}

export type ParsedRecurrenceUiFields = {
  recurrenceType: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  daysOfWeek: string[];
  dayOfMonth?: number;
  month?: number;
  repeatOn?: { week: number; weekday: number };
  repeatInterval: number;
  endRecur?: string;
};

// rrule numbers weekdays MO=0..SU=6; the app's letter codes and `repeatOn.weekday`
// both follow iCalendar's SU-first ordering instead. Index = rrule weekday number.
const RRULE_WEEKDAY_TO_CODE = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
const rruleWeekdayToRepeatOnWeekday = (rruleWeekday: number) => (rruleWeekday + 1) % 7;

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (value === null || value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

const WEEKDAY_STRS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

// `ByWeekday` covers rrule's construction-time inputs (string/number/Weekday), but
// `rrulestr`-parsed `origOptions.byweekday` is always `Weekday` instances in
// practice. Normalize defensively rather than assuming that.
function normalizeWeekday(value: ByWeekday): { weekday: number; n?: number } {
  if (typeof value === 'number') return { weekday: value };
  if (typeof value === 'string') return { weekday: Math.max(0, WEEKDAY_STRS.indexOf(value)) };
  return { weekday: value.weekday, n: value.n ?? undefined };
}

const EMPTY_PARSE_RESULT: ParsedRecurrenceUiFields = {
  recurrenceType: 'none',
  daysOfWeek: [],
  repeatInterval: 1
};

/**
 * Parses a bare `RRULE:...` string (as stored on a Google-native `type: 'rrule'`
 * master event) into the same fields the recurring-event edit form uses. Without
 * this, reopening the edit modal on a Google recurring event shows its recurrence
 * as blank, since the form only knows how to read `type: 'recurring'` events.
 *
 * Only covers the recurrence shapes the `recurring` event type itself can already
 * represent (daily/weekly/monthly[-on-the-Nth]/yearly, single interval, single
 * UNTIL) - anything more exotic in the source RRULE has no UI equivalent to hydrate
 * into regardless.
 */
export function parseRruleForUiFields(rruleString: string): ParsedRecurrenceUiFields {
  let rule;
  try {
    rule = rrulestr(rruleString);
  } catch {
    return EMPTY_PARSE_RESULT;
  }

  const opts = rule.origOptions;
  const repeatInterval = opts.interval ?? 1;
  const endRecur = opts.until
    ? (DateTime.fromJSDate(opts.until).toISODate() ?? undefined)
    : undefined;

  if (opts.freq === RRule.YEARLY) {
    return {
      recurrenceType: 'yearly',
      daysOfWeek: [],
      month: firstOf(opts.bymonth),
      dayOfMonth: firstOf(opts.bymonthday),
      repeatInterval,
      endRecur
    };
  }

  if (opts.freq === RRule.MONTHLY) {
    const rawWeekday = firstOf(opts.byweekday);
    if (rawWeekday !== undefined) {
      const weekday = normalizeWeekday(rawWeekday);
      const week = weekday.n ?? firstOf(opts.bysetpos) ?? 1;
      return {
        recurrenceType: 'monthly',
        daysOfWeek: [],
        repeatOn: { week, weekday: rruleWeekdayToRepeatOnWeekday(weekday.weekday) },
        repeatInterval,
        endRecur
      };
    }
    return {
      recurrenceType: 'monthly',
      daysOfWeek: [],
      dayOfMonth: firstOf(opts.bymonthday),
      repeatInterval,
      endRecur
    };
  }

  if (opts.freq === RRule.WEEKLY) {
    const entries: ByWeekday[] = opts.byweekday
      ? Array.isArray(opts.byweekday)
        ? opts.byweekday
        : [opts.byweekday]
      : [];
    return {
      recurrenceType: 'weekly',
      daysOfWeek: entries
        .map(w => RRULE_WEEKDAY_TO_CODE[normalizeWeekday(w).weekday])
        .filter(Boolean),
      repeatInterval,
      endRecur
    };
  }

  if (opts.freq === RRule.DAILY) {
    return {
      recurrenceType: 'daily',
      daysOfWeek: [],
      repeatInterval,
      endRecur
    };
  }

  return EMPTY_PARSE_RESULT;
}
