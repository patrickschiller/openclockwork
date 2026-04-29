import { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { api, type RequestDto, type RequestType } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';

const TYPE_COLOR: Record<RequestType, string> = {
  Vacation: '#1F8E3D',
  HomeOffice: '#1F6FEB',
  SpecialLeave: '#7B5BCC',
  TimeCorrection: '#B5651D'
};

const TYPE_LABEL: Record<RequestType, string> = {
  Vacation: 'Urlaub',
  HomeOffice: 'Home-Office',
  SpecialLeave: 'Sonderurlaub',
  TimeCorrection: 'Zeitkorrektur'
};

export function CalendarPage() {
  const { current } = useCurrentEmployee();
  const employeeId = current?.id;
  const [year, setYear] = useState(new Date().getFullYear());

  const requestsQuery = useQuery({
    queryKey: ['requests', 'mine', employeeId],
    queryFn: () => api.listRequests({ employeeId }),
    enabled: !!employeeId
  });

  const dayMap = useMemo(() => buildDayMap(requestsQuery.data ?? [], year), [requestsQuery.data, year]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Stack spacing={1}>
          <Typography variant="h1">Kalender</Typography>
          <Typography variant="body1" color="text.secondary">
            Genehmigte Abwesenheiten und Anträge im Jahresüberblick.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={() => setYear((y) => y - 1)} aria-label="Vorheriges Jahr">
            <ChevronLeft />
          </IconButton>
          <Typography variant="h4">{year}</Typography>
          <IconButton onClick={() => setYear((y) => y + 1)} aria-label="Nächstes Jahr">
            <ChevronRight />
          </IconButton>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap">
        {(Object.keys(TYPE_COLOR) as RequestType[]).map((t) => (
          <Chip
            key={t}
            label={TYPE_LABEL[t]}
            size="small"
            sx={{ bgcolor: TYPE_COLOR[t], color: '#fff' }}
          />
        ))}
        <Chip variant="outlined" label="Antrag offen (gestreift)" size="small" />
      </Stack>

      {requestsQuery.isLoading && <CircularProgress aria-label="Lade Anträge" />}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }
        }}
      >
        {Array.from({ length: 12 }, (_, m) => (
          <MonthGrid key={m} year={year} month={m} dayMap={dayMap} />
        ))}
      </Box>
    </Stack>
  );
}

interface DayInfo {
  type: RequestType;
  pending: boolean;
  reason: string | null;
}

function buildDayMap(requests: RequestDto[], year: number): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>();
  for (const r of requests) {
    if (r.status === 'Rejected') continue;
    const start = startOfDay(new Date(r.from));
    const end = startOfDay(new Date(r.to));
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      if (d.getFullYear() !== year) continue;
      const key = isoDay(d);
      const existing = map.get(key);
      if (existing && existing.type === r.type && !existing.pending) continue;
      map.set(key, {
        type: r.type,
        pending: r.status === 'Submitted',
        reason: r.reason
      });
    }
  }
  return map;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function MonthGrid({ year, month, dayMap }: { year: number; month: number; dayMap: Map<string, DayInfo> }) {
  const monthName = new Date(year, month, 1).toLocaleDateString('de-DE', { month: 'long' });
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { day: number | null; key: string; info: DayInfo | undefined }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, key: `pad-${month}-${i}`, info: undefined });
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = isoDay(date);
    cells.push({ day, key, info: dayMap.get(key) });
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" sx={{ mb: 1, textTransform: 'capitalize' }}>
          {monthName}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 0.5,
            fontSize: 12
          }}
        >
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
            <Box key={d} sx={{ textAlign: 'center', color: 'text.secondary' }}>
              {d}
            </Box>
          ))}
          {cells.map((c) => {
            if (c.day === null) return <Box key={c.key} />;
            const dow = ((c.day + firstWeekday - 1) % 7);
            const isWeekend = dow === 5 || dow === 6;
            const bg = c.info ? TYPE_COLOR[c.info.type] : 'transparent';
            const fg = c.info ? '#fff' : isWeekend ? 'var(--mui-palette-text-secondary)' : 'inherit';
            const tooltipText = c.info
              ? `${TYPE_LABEL[c.info.type]}${c.info.pending ? ' (offen)' : ''}${c.info.reason ? ` – ${c.info.reason}` : ''}`
              : '';
            const cell = (
              <Box
                sx={{
                  position: 'relative',
                  aspectRatio: '1',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 1,
                  bgcolor: bg,
                  color: fg,
                  fontWeight: 500,
                  outline: c.info?.pending ? '1px dashed' : 'none',
                  outlineColor: 'currentColor'
                }}
              >
                {c.day}
              </Box>
            );
            return tooltipText ? (
              <Tooltip key={c.key} title={tooltipText}>
                {cell}
              </Tooltip>
            ) : (
              <Box key={c.key}>{cell}</Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
