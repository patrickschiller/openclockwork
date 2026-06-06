import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  api,
  type AbsenceDto,
  type AbsenceKind,
  type RequestDto,
  type RequestType,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { cn } from '@/lib/utils';

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

// TimeAdjustment is intentionally absent: a Zeitkorrektur is a booking
// correction, not an absence state, and the spec's year-calendar legend
// (US 3.3) only covers Krankheit/Urlaub/Home-Office/Schulung/Sonderurlaub/
// Gleittage. TimeAdjustment requests are filtered out before rendering.
const TYPE_COLOR: Partial<Record<RequestType, string>> = {
  Vacation: 'bg-emerald-500',
  HomeOffice: 'bg-sky-500',
  SpecialLeave: 'bg-violet-500',
};

const TYPE_LABEL: Partial<Record<RequestType, string>> = {
  Vacation: 'Urlaub',
  HomeOffice: 'Home-Office',
  SpecialLeave: 'Sonderurlaub',
};

const ABSENCE_COLOR: Record<AbsenceKind, string> = {
  Sickness: 'bg-rose-500',
  Training: 'bg-indigo-500',
  Flextime: 'bg-yellow-500',
};

const ABSENCE_LABEL: Record<AbsenceKind, string> = {
  Sickness: 'Krankheit',
  Training: 'Schulung',
  Flextime: 'Gleittag',
};

function daysInMonth(year: number, monthIdx0: number): number {
  return new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
}

function startWeekdayMon0(year: number, monthIdx0: number): number {
  const dow = new Date(Date.UTC(year, monthIdx0, 1)).getUTCDay();
  return (dow + 6) % 7;
}

function utcRange(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function requestsOnDay(year: number, monthIdx0: number, day: number, requests: RequestDto[]): RequestDto[] {
  const ts = Date.UTC(year, monthIdx0, day);
  return requests.filter((r) => ts >= utcRange(r.from) && ts <= utcRange(r.to));
}

function absencesOnDay(year: number, monthIdx0: number, day: number, absences: AbsenceDto[]): AbsenceDto[] {
  const ts = Date.UTC(year, monthIdx0, day);
  return absences.filter((a) => ts >= utcRange(a.from) && ts <= utcRange(a.to));
}

export function CalendarPage() {
  const user = useCurrentUser();
  const [year, setYear] = useState(new Date().getUTCFullYear());

  const requestsQuery = useQuery({
    queryKey: ['requests', { employeeId: user.id }],
    queryFn: () => api.listRequests({ employeeId: user.id }),
  });
  const absencesQuery = useQuery({
    queryKey: ['absences', user.id],
    queryFn: () => api.absences({ employeeId: user.id }),
  });

  const requests = useMemo(
    () =>
      (requestsQuery.data ?? []).filter(
        (r) =>
          r.workflowState !== 'Cancelled' &&
          r.workflowState !== 'Rejected' &&
          // A Zeitkorrektur materialises as a TimeEntry on approval; it is
          // not an absence state and does not belong on the year calendar.
          r.type !== 'TimeAdjustment',
      ),
    [requestsQuery.data],
  );
  const absences = absencesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Kalender {year}</h1>
          <p className="text-sm text-muted-foreground">
            Genehmigte und offene Anträge plus Abwesenheiten im Jahresüberblick
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear(year - 1)} aria-label="Vorheriges Jahr">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setYear(year + 1)} aria-label="Nächstes Jahr">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        {(Object.keys(TYPE_COLOR) as RequestType[]).map((t) => (
          <span key={t} className="flex items-center gap-2">
            <span className={cn('inline-block h-3 w-3 rounded-full', TYPE_COLOR[t])} aria-hidden />
            {TYPE_LABEL[t]}
          </span>
        ))}
        {(Object.keys(ABSENCE_COLOR) as AbsenceKind[]).map((k) => (
          <span key={k} className="flex items-center gap-2">
            <span className={cn('inline-block h-3 w-3 rounded-full', ABSENCE_COLOR[k])} aria-hidden />
            {ABSENCE_LABEL[k]}
          </span>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {MONTHS.map((label, monthIdx0) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-base">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <Month year={year} monthIdx0={monthIdx0} requests={requests} absences={absences} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface MonthProps {
  year: number;
  monthIdx0: number;
  requests: RequestDto[];
  absences: AbsenceDto[];
}

function Month({ year, monthIdx0, requests, absences }: MonthProps) {
  const total = daysInMonth(year, monthIdx0);
  const startOffset = startWeekdayMon0(year, monthIdx0);

  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= total; d += 1) cells.push(d);

  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => (
        <span key={i} className="text-center text-muted-foreground">
          {d}
        </span>
      ))}
      {cells.map((d, i) => {
        if (d === null) return <span key={i} />;
        const dayAbsences = absencesOnDay(year, monthIdx0, d, absences);
        const requestsHere = requestsOnDay(year, monthIdx0, d, requests);

        // Absences (sickness / training / flextime) win visually over requests.
        if (dayAbsences.length > 0) {
          const a = dayAbsences[0];
          const titleSuffix = a.kind === 'Sickness' && a.certified ? ' (Attest)' : '';
          return (
            <span
              key={i}
              title={`${ABSENCE_LABEL[a.kind]}${a.note ? ' — ' + a.note : ''}${titleSuffix}`}
              className={cn(
                'flex h-7 items-center justify-center rounded text-[11px] text-white',
                ABSENCE_COLOR[a.kind],
              )}
            >
              {d}
            </span>
          );
        }

        const main = requestsHere[0];
        const isPending = main && main.workflowState !== 'Approved';
        return (
          <span
            key={i}
            title={
              main
                ? `${TYPE_LABEL[main.type as RequestType]} (${main.workflowState})${main.reason ? ' — ' + main.reason : ''}`
                : undefined
            }
            className={cn(
              'flex h-7 items-center justify-center rounded text-[11px]',
              !main && 'text-muted-foreground',
              main && TYPE_COLOR[main.type as RequestType],
              main && 'text-white',
              main && isPending && 'opacity-60 outline outline-1 outline-dashed outline-current',
            )}
          >
            {d}
          </span>
        );
      })}
    </div>
  );
}
