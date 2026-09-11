import { parseRruleForUiFields } from './rrule';

describe('parseRruleForUiFields', () => {
  it('parses a daily rule', () => {
    expect(parseRruleForUiFields('RRULE:FREQ=DAILY')).toEqual(
      expect.objectContaining({ recurrenceType: 'daily', repeatInterval: 1 })
    );
  });

  it('parses a daily rule with an interval', () => {
    expect(parseRruleForUiFields('RRULE:FREQ=DAILY;INTERVAL=3')).toEqual(
      expect.objectContaining({ recurrenceType: 'daily', repeatInterval: 3 })
    );
  });

  it('parses a weekly rule into day codes', () => {
    const result = parseRruleForUiFields('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(result.recurrenceType).toBe('weekly');
    expect([...result.daysOfWeek].sort()).toEqual(['F', 'M', 'W']);
  });

  it('parses a monthly-by-day-of-month rule (the Google master format from the bug report)', () => {
    expect(parseRruleForUiFields('RRULE:FREQ=MONTHLY;BYMONTHDAY=24')).toEqual(
      expect.objectContaining({ recurrenceType: 'monthly', dayOfMonth: 24 })
    );
  });

  it('parses a monthly positional rule using a separate BYSETPOS', () => {
    expect(parseRruleForUiFields('RRULE:FREQ=MONTHLY;BYDAY=TU;BYSETPOS=3')).toEqual(
      expect.objectContaining({
        recurrenceType: 'monthly',
        repeatOn: { week: 3, weekday: 2 } // Tuesday -> 2 under Sun=0 convention
      })
    );
  });

  it('parses a monthly positional rule using an embedded ordinal (e.g. -1FR = last Friday)', () => {
    expect(parseRruleForUiFields('RRULE:FREQ=MONTHLY;BYDAY=-1FR')).toEqual(
      expect.objectContaining({
        recurrenceType: 'monthly',
        repeatOn: { week: -1, weekday: 5 } // Friday -> 5 under Sun=0 convention
      })
    );
  });

  it('parses a yearly rule', () => {
    expect(parseRruleForUiFields('RRULE:FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=15')).toEqual(
      expect.objectContaining({ recurrenceType: 'yearly', month: 6, dayOfMonth: 15 })
    );
  });

  it('parses an UNTIL date into endRecur', () => {
    const result = parseRruleForUiFields('RRULE:FREQ=DAILY;UNTIL=20261231T235959Z');
    expect(result.endRecur).toBeDefined();
    expect(result.endRecur).toMatch(/^2026-12-3[01]$/);
  });

  it('falls back to none on an unparseable string', () => {
    expect(parseRruleForUiFields('not a valid rrule')).toEqual(
      expect.objectContaining({ recurrenceType: 'none', daysOfWeek: [] })
    );
  });
});
