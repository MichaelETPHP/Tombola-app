import Kenat from 'kenat';

/**
 * Ethiopian-calendar date in Amharic, e.g. "ነሐሴ 29 2018" — this admin
 * dashboard operates for an Ethiopian audience, so every date the app
 * shows (registration, ticket purchase, claim deadlines, audit events)
 * reads in the calendar and language admins actually think in, not the
 * Gregorian date the database happens to store.
 */
export function toEthiopianDate(iso: string | Date): string {
  return new Kenat(new Date(iso)).format();
}

/** Same as toEthiopianDate, plus the 12-hour Ethiopian time (e.g. "11:35 ጠዋት"). */
export function toEthiopianDateTime(iso: string | Date): string {
  return new Kenat(new Date(iso)).format({ includeTime: true });
}
