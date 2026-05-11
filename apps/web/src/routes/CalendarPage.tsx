import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type RequestDto, type RequestType } from '../api/client';
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

const TYPE_COLOR: Record<RequestType, string> = {
  Vacation: 'bg-emerald-500',
  HomeOffice: 'bg-sky-500',
  SpecialLeave: 'bg-violet-500',
  TimeAdjustment: 'bg-amber-500',
};

function daysInMonth(year: number, monthIdx0: number): number {
  return new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
}

function startWeekdayMon0(year: number, monthIdx0: number): number {
  // Monday-first index (Mon=0..Sun=6)
  const dow = new Date(Date.UTC(year, monthIdx0, 1)).getUTCDay(); // Sun=0..Sat=6
  return (dow + 6) % 7;
}

function dayCovered(year: number, monthIdx0: number, day: number, requests: RequestDto[]): RequestDto[] {
  const ts = Date.UTC(year, monthIdx0, day);
  return requests.filter((r) => {
    const from = Date.UTC(
      new Date(r.from).getUTCFullYear(),
      new Date(r.from).getUTCMonth(),
      new Date(r.from).getUTCDate(),
    );
    const to = Date.UTC(
      new Date(r.to).getUTCFullYear(),
      new Date(r.to).getUTCMonth(),
      new Date(r.to).getUTCDate(),
    );
    return ts >= from && ts <= to;
  });
}

export function CalendarPage() {
  const user = useCurrentUser();
  const [year, setYear] = useState(new Date().getUTCFullYear());

  const requestsQuery = useQuery({
    queryKey: ['requests', { employeeId: user.id }],
    queryFn: () => api.listRequests({ employeeId: user.id }),
  });

  const requests = useMemo(
    () => (requestsQuery.data ?? []).filter((r) => r.workflowState !== 'Cancelled' && r.workflowState !== 'Rejected'),
    [requestsQuery.data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Kalender {year}</h1>
          <p className="text-sm text-muted-foreground">Genehmigte und offene Anträge im Jahresüberblick</p>
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
            {t}
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
              <Month year={year} monthIdx0={monthIdx0} requests={requests} />
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
}

function Month({ year, monthIdx0, requests }: MonthProps) {
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
        const matches = dayCovered(year, monthIdx0, d, requests);
        const main = matches[0];
        const isPending = main && main.workflowState !== 'Approved';
        return (
          <span
            key={i}
            title={
              main
                ? `${main.type} (${main.workflowState})${main.reason ? ' — ' + main.reason : ''}`
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
