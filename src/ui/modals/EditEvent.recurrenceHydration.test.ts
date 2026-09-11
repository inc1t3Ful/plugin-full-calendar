import { getInitialRecurrenceType } from './EditEvent';
import { OFCEvent } from '../../types';

describe('recurrence type hydration for edit modal', () => {
  it('reads recurrence type from a type: recurring event (unchanged behavior)', () => {
    expect(
      getInitialRecurrenceType({
        type: 'recurring',
        dayOfMonth: 24
      } as unknown as OFCEvent)
    ).toBe('monthly');
  });

  it('returns none for a non-recurring event', () => {
    expect(getInitialRecurrenceType({ type: 'single' } as unknown as OFCEvent)).toBe('none');
  });

  it('reads recurrence type from a Google-native type: rrule event', () => {
    expect(
      getInitialRecurrenceType({
        type: 'rrule',
        rrule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=24'
      } as unknown as OFCEvent)
    ).toBe('monthly');
  });

  it('returns none for a type: rrule event with no rrule string', () => {
    expect(getInitialRecurrenceType({ type: 'rrule' } as unknown as OFCEvent)).toBe('none');
  });
});
