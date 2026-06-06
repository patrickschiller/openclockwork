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

/**
 * ISO-3166-2 codes for the 16 German states.
 */
export const BUNDESLAENDER = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const;
export type Bundesland = (typeof BUNDESLAENDER)[number];

export const BUNDESLAND_LABEL: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

interface HolidaySpec {
  name: string;
  /** All states celebrate this (federal). */
  federal?: true;
  /** Set of state codes that observe this holiday in addition to federal. */
  states?: Bundesland[];
  /** Returns the Date for the given year. */
  date: (year: number) => Date;
}

const SPECS: HolidaySpec[] = [
  { name: 'Neujahr', federal: true, date: (y) => new Date(Date.UTC(y, 0, 1)) },
  { name: 'Heilige Drei Könige', states: ['BW', 'BY', 'ST'], date: (y) => new Date(Date.UTC(y, 0, 6)) },
  { name: 'Internationaler Frauentag', states: ['BE', 'MV'], date: (y) => new Date(Date.UTC(y, 2, 8)) },
  { name: 'Karfreitag', federal: true, date: (y) => addDays(gregorianEaster(y), -2) },
  { name: 'Ostermontag', federal: true, date: (y) => addDays(gregorianEaster(y), 1) },
  { name: 'Tag der Arbeit', federal: true, date: (y) => new Date(Date.UTC(y, 4, 1)) },
  { name: 'Christi Himmelfahrt', federal: true, date: (y) => addDays(gregorianEaster(y), 39) },
  { name: 'Pfingstmontag', federal: true, date: (y) => addDays(gregorianEaster(y), 50) },
  {
    name: 'Fronleichnam',
    states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'],
    date: (y) => addDays(gregorianEaster(y), 60),
  },
  { name: 'Mariä Himmelfahrt', states: ['BY', 'SL'], date: (y) => new Date(Date.UTC(y, 7, 15)) },
  { name: 'Weltkindertag', states: ['TH'], date: (y) => new Date(Date.UTC(y, 8, 20)) },
  {
    name: 'Tag der Deutschen Einheit',
    federal: true,
    date: (y) => new Date(Date.UTC(y, 9, 3)),
  },
  {
    name: 'Reformationstag',
    states: ['BB', 'HB', 'HH', 'MV', 'NI', 'SH', 'SN', 'ST', 'TH'],
    date: (y) => new Date(Date.UTC(y, 9, 31)),
  },
  {
    name: 'Allerheiligen',
    states: ['BW', 'BY', 'NW', 'RP', 'SL'],
    date: (y) => new Date(Date.UTC(y, 10, 1)),
  },
  {
    name: 'Buß- und Bettag',
    states: ['SN'],
    // Wednesday before November 23.
    date: (y) => {
      const ref = new Date(Date.UTC(y, 10, 23));
      const dow = ref.getUTCDay(); // Sun=0..Sat=6
      // step back to previous Wednesday (Wed=3)
      const offset = ((dow + 4) % 7) + 1; // days to subtract to reach previous Wed
      return addDays(ref, -offset);
    },
  },
  { name: '1. Weihnachtstag', federal: true, date: (y) => new Date(Date.UTC(y, 11, 25)) },
  { name: '2. Weihnachtstag', federal: true, date: (y) => new Date(Date.UTC(y, 11, 26)) },
];

/** Public holidays in the given Bundesland for the given year. */
export function holidaysFor(state: Bundesland, year: number): Holiday[] {
  const out: Holiday[] = [];
  for (const s of SPECS) {
    if (s.federal || s.states?.includes(state)) {
      out.push({ name: s.name, date: s.date(year) });
    }
  }
  // Sort by date so the result is stable for callers/snapshots.
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

/** @deprecated retained for backwards compatibility — equivalent to `holidaysFor('NW', year)`. */
export function nrwHolidays(year: number): Holiday[] {
  return holidaysFor('NW', year);
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

/** Build a HolidayProvider for a specific Bundesland. */
export function holidayProviderFor(state: Bundesland): HolidayProvider {
  return {
    isHoliday(date: Date): boolean {
      return holidaysFor(state, date.getUTCFullYear()).some((h) => sameUtcDay(h.date, date));
    },
    list(year: number): Holiday[] {
      return holidaysFor(state, year);
    },
  };
}

/** Default provider — NRW. */
export const NrwHolidayProvider: HolidayProvider = holidayProviderFor('NW');
