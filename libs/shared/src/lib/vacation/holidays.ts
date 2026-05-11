/**
 * Anonymous Gregorian Easter algorithm. Returns Easter Sunday as a UTC midnight Date.
 */
function gregorianEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export interface Holiday {
  date: Date;
  name: string;
}

/** Public holidays in North Rhine-Westphalia (Germany) for the given year. */
export function nrwHolidays(year: number): Holiday[] {
  const easter = gregorianEaster(year);
  return [
    { date: new Date(Date.UTC(year, 0, 1)), name: 'Neujahr' },
    { date: addDays(easter, -2), name: 'Karfreitag' },
    { date: addDays(easter, 1), name: 'Ostermontag' },
    { date: new Date(Date.UTC(year, 4, 1)), name: 'Tag der Arbeit' },
    { date: addDays(easter, 39), name: 'Christi Himmelfahrt' },
    { date: addDays(easter, 50), name: 'Pfingstmontag' },
    { date: addDays(easter, 60), name: 'Fronleichnam' },
    { date: new Date(Date.UTC(year, 9, 3)), name: 'Tag der Deutschen Einheit' },
    { date: new Date(Date.UTC(year, 10, 1)), name: 'Allerheiligen' },
    { date: new Date(Date.UTC(year, 11, 25)), name: '1. Weihnachtstag' },
    { date: new Date(Date.UTC(year, 11, 26)), name: '2. Weihnachtstag' },
  ];
}

export interface HolidayProvider {
  isHoliday(date: Date): boolean;
  list(year: number): Holiday[];
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export const NrwHolidayProvider: HolidayProvider = {
  isHoliday(date: Date): boolean {
    return nrwHolidays(date.getUTCFullYear()).some((h) => sameUtcDay(h.date, date));
  },
  list(year: number): Holiday[] {
    return nrwHolidays(year);
  },
};
