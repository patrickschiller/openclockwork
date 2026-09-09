import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { soloApi, type PersonalDay } from '../../api/solo';
import { useI18n } from '../../app/i18n';
import { dateInZone } from '../../app/solo-time';
import { Field, QueryError } from './SoloUi';

const kindColors: Record<PersonalDay['kind'], string> = {
  Free: 'bg-sky-500',
  Vacation: 'bg-emerald-500',
  Sickness: 'bg-rose-500',
  Training: 'bg-violet-500',
};
export function SoloMonthCalendar({
  days,
  timeZone,
}: {
  days: PersonalDay[];
  timeZone: string;
}) {
  const { t, languageTag } = useI18n();
  const [month, setMonth] = useState(dateInZone(timeZone).slice(0, 7));
  const [year, monthNumber] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leading =
    (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const report = useQuery({
    queryKey: ['solo-report', 'calendar', month],
    queryFn: () =>
      soloApi.report(
        new URLSearchParams({ from: `${month}-01`, to: `${month}-${end}` }),
      ),
    enabled: /^\d{4}-\d{2}$/.test(month),
  });
  const netByDate = new Map<string, number>();
  report.data?.rows.forEach((row) =>
    netByDate.set(row.date, (netByDate.get(row.date) ?? 0) + row.netMinutes),
  );
  const move = (delta: number) =>
    setMonth(
      new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
        .toISOString()
        .slice(0, 7),
    );
  const monthTitle = new Date(
    Date.UTC(year, monthNumber - 1, 1),
  ).toLocaleDateString(languageTag, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label={t('solo.calendarMonth')}>
            <Input
              type="month"
              value={month}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={t('solo.previousMonth')}
              onClick={() => move(-1)}
            >
              ‹
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonth(dateInZone(timeZone).slice(0, 7))}
            >
              {t('solo.today')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={t('solo.nextMonth')}
              onClick={() => move(1)}
            >
              ›
            </Button>
          </div>
        </div>
        <QueryError error={report.error} retry={report.refetch} />
        <p className="text-xs text-muted-foreground">
          {t('solo.calendarTimesHint', { timeZone })}
        </p>
        <div role="table" aria-label={monthTitle}>
          <div className="grid grid-cols-7" role="row">
            {Array.from({ length: 7 }, (_, index) => (
              <div
                role="columnheader"
                className="pb-2 text-center text-xs font-medium text-muted-foreground"
                key={index}
              >
                {new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(
                  languageTag,
                  { weekday: 'short', timeZone: 'UTC' },
                )}
              </div>
            ))}
          </div>
          {Array.from({ length: Math.ceil((leading + end) / 7) }, (_, week) => (
            <div key={week} role="row" className="grid grid-cols-7">
              {Array.from({ length: 7 }, (_, weekday) => {
                const day = week * 7 + weekday - leading + 1;
                if (day < 1 || day > end)
                  return (
                    <div
                      key={weekday}
                      role="cell"
                      className="min-h-20 border border-transparent"
                    />
                  );
                const date = `${month}-${String(day).padStart(2, '0')}`;
                const freeDays = days.filter(
                  (item) =>
                    !item.cancelledAt && item.from <= date && item.to >= date,
                );
                const net = netByDate.get(date);
                const time =
                  net == null
                    ? ''
                    : `${(net / 60).toLocaleString(languageTag, { maximumFractionDigits: 2 })}h`;
                const label = [
                  date,
                  time ? `${t('solo.net')}: ${time}` : '',
                  ...freeDays.map((item) => t(`solo.day.${item.kind}`)),
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <div
                    key={weekday}
                    role="cell"
                    aria-label={label}
                    title={label}
                    className={`flex min-h-20 min-w-0 flex-col items-center gap-1 border p-1 text-center ${date === dateInZone(timeZone) ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <span className="text-sm font-medium">{day}</span>
                    {time && (
                      <span className="text-[10px] tabular-nums sm:text-xs">
                        {time}
                      </span>
                    )}
                    <span className="flex flex-wrap justify-center gap-1">
                      {freeDays.map((item) => (
                        <span
                          key={item.id}
                          aria-hidden
                          className={`h-2 w-2 rounded-full ${kindColors[item.kind]}`}
                        />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {(Object.keys(kindColors) as PersonalDay['kind'][]).map((kind) => (
            <span key={kind} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${kindColors[kind]}`}
              />
              {t(`solo.day.${kind}`)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
