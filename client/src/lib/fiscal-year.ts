import NepaliDate from 'nepali-date-converter';

/**
 * Nepali Fiscal Year Utilities
 *
 * The Nepali fiscal year runs from 1 Shrawan to 31 Ashad.
 * In Gregorian terms this is approximately July 16/17 to July 15/16.
 * The exact date varies each year because the Nepali calendar is not
 * a fixed offset from the Gregorian calendar.
 *
 * Shrawan is month index 3 (0-based: Baisakh=0, Jestha=1, Asar=2, Shrawan=3).
 */

const SHRAWAN_MONTH_INDEX = 3; // 0-based

/**
 * Get the Gregorian start and end dates for a given Nepali fiscal year.
 * A fiscal year labeled "2082/83" starts on Shrawan 1 of BS 2082
 * and ends the day before Shrawan 1 of BS 2083.
 *
 * @param bsYear - The BS year the fiscal year starts in (e.g. 2082 for FY 2082/83)
 * @returns { start: Date, end: Date } in Gregorian
 */
export function getFiscalYearDates(bsYear: number): { start: Date; end: Date } {
  // Shrawan 1 of the given BS year = start of fiscal year
  const start = new NepaliDate(bsYear, SHRAWAN_MONTH_INDEX, 1).toJsDate();
  // Shrawan 1 of the next BS year = start of the next fiscal year
  const nextStart = new NepaliDate(bsYear + 1, SHRAWAN_MONTH_INDEX, 1).toJsDate();
  // End = day before the next fiscal year starts
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  // Set end to end-of-day
  end.setHours(23, 59, 59, 999);
  // Set start to start-of-day
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

/**
 * Determine which Nepali fiscal year "today" (or a given date) falls in.
 * Returns the BS year that the fiscal year starts in.
 *
 * @param date - The Gregorian date to check (defaults to now)
 * @returns The BS year of the current fiscal year (e.g. 2082)
 */
export function getCurrentFiscalYear(date: Date = new Date()): number {
  // Convert the given date to a NepaliDate to get the BS year
  const nepDate = new NepaliDate(date);
  const bsYear = nepDate.getYear();
  const bsMonth = nepDate.getMonth(); // 0-based

  // Months 0-2 (Baisakh, Jestha, Asar) belong to the fiscal year that
  // started in the PREVIOUS BS year (Shrawan of bsYear - 1).
  // Months 3-11 (Shrawan onwards) belong to the fiscal year starting this BS year.
  if (bsMonth < SHRAWAN_MONTH_INDEX) {
    return bsYear - 1;
  }
  return bsYear;
}

/**
 * Get a display label for a fiscal year, e.g. "2082/83".
 *
 * @param bsYear - The BS year the fiscal year starts in
 */
export function getFiscalYearLabel(bsYear: number): string {
  const nextYearShort = String(bsYear + 1).slice(-2);
  return `${bsYear}/${nextYearShort}`;
}

/**
 * Get the Gregorian label for a fiscal year, e.g. "Jul 16, 2025 – Jul 15, 2026".
 *
 * @param bsYear - The BS year the fiscal year starts in
 */
export function getFiscalYearGregorianLabel(bsYear: number): string {
  const { start, end } = getFiscalYearDates(bsYear);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Get the number of days remaining in the current fiscal year.
 *
 * @param date - Reference date (defaults to now)
 */
export function getDaysRemainingInFiscalYear(date: Date = new Date()): number {
  const currentFY = getCurrentFiscalYear(date);
  const { end } = getFiscalYearDates(currentFY);
  const now = new Date(date);
  now.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  const diffMs = endDay.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Get a list of available fiscal years for dropdown menus.
 * Returns fiscal years from BS 2075 up to the current fiscal year.
 * Each entry has a bsYear and a label.
 */
export function getAvailableFiscalYears(): Array<{ bsYear: number; label: string }> {
  const START_YEAR = 2075;
  const current = getCurrentFiscalYear();

  const years: Array<{ bsYear: number; label: string }> = [];
  for (let y = current; y >= START_YEAR; y--) {
    years.push({ bsYear: y, label: getFiscalYearLabel(y) });
  }
  return years;
}

/**
 * Determine which fiscal years contain data, given a list of dates.
 * Returns only the fiscal years that have at least one date falling within them,
 * plus always includes the current fiscal year.
 * Sorted most recent first.
 *
 * @param dates - Array of Date objects (e.g. ledger entry dates)
 */
export function getFiscalYearsWithData(dates: Date[]): Array<{ bsYear: number; label: string }> {
  const current = getCurrentFiscalYear();
  const fySet = new Set<number>();
  // Always include current fiscal year
  fySet.add(current);

  for (const d of dates) {
    const fy = getCurrentFiscalYear(d);
    fySet.add(fy);
  }

  return Array.from(fySet)
    .sort((a, b) => b - a)
    .map(y => ({ bsYear: y, label: getFiscalYearLabel(y) }));
}
