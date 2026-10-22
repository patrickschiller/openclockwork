import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  api,
  downloadAuthenticated,
  type WorkingTimeReportDto,
  type WorkingTimeReportLocationDto,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';

interface CsvLabels {
  date: string;
  employee: string;
  start: string;
  clockInLocation: string;
  end: string;
  clockOutLocation: string;
  gross: string;
  break: string;
  net: string;
  status: string;
  total: string;
}

function csvEscape(value: string): string {
  // Spreadsheet applications may evaluate a formula after leading whitespace.
  const safeValue = /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(safeValue)
    ? `"${safeValue.replace(/"/g, '""')}"`
    : safeValue;
}

function formatMinutes(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutePart = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secondPart = totalSeconds % 60;
  return `${hours}:${minutePart}${secondPart ? `:${secondPart.toString().padStart(2, '0')}` : ''}`;
}

function formatTime(value: string, languageTag: string): string {
  return new Date(value).toLocaleTimeString(languageTag, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLocation(
  location: WorkingTimeReportLocationDto | null | undefined,
  languageTag: string,
): string {
  if (!location) return '–';
  const coordinates =
    location.latitude !== null && location.longitude !== null
      ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      : null;
  const accuracy =
    location.accuracyMeters === null
      ? null
      : `±${new Intl.NumberFormat(languageTag, {
          maximumFractionDigits: 0,
        }).format(location.accuracyMeters)} m`;
  const parts = [location.label, coordinates, accuracy].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(' · ') : '–';
}

export function workingTimeReportToCsv(
  report: WorkingTimeReportDto,
  labels: CsvLabels,
  languageTag: string,
  statusLabel: (status: string) => string,
  includeLocations = false,
): string {
  const header = [
    labels.date,
    labels.employee,
    labels.start,
    ...(includeLocations ? [labels.clockInLocation] : []),
    labels.end,
    ...(includeLocations ? [labels.clockOutLocation] : []),
    labels.gross,
    labels.break,
    labels.net,
    labels.status,
  ];
  const rows = report.rows.map((row) =>
    [
      row.date,
      row.employeeName,
      formatTime(row.clockIn, languageTag),
      ...(includeLocations
        ? [formatLocation(row.clockInLocation, languageTag)]
        : []),
      formatTime(row.clockOut, languageTag),
      ...(includeLocations
        ? [formatLocation(row.clockOutLocation, languageTag)]
        : []),
      formatMinutes(row.grossMinutes),
      formatMinutes(row.breakMinutes),
      formatMinutes(row.netMinutes),
      statusLabel(row.status),
    ]
      .map(csvEscape)
      .join(';'),
  );
  const total = [
    labels.total,
    ...Array.from({ length: includeLocations ? 5 : 3 }, () => ''),
    formatMinutes(report.totals.grossMinutes),
    formatMinutes(report.totals.breakMinutes),
    formatMinutes(report.totals.netMinutes),
    '',
  ];
  return '\uFEFF' + [header.join(';'), ...rows, total.join(';')].join('\r\n');
}

function dateInputValue(date: Date): string {
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  return {
    from: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: dateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

const MULTIPLE_EMPLOYEES = '__multiple__';

export function AdminWorkingTimesPage() {
  const user = useCurrentUser();
  const { t, enumLabel, languageTag, locale } = useI18n();
  const initialRange = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [employeeId, setEmployeeId] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [includeLocations, setIncludeLocations] = useState(false);
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const isAuthorized = user.role === 'HRAdmin';
  const orderedRange = from !== '' && to !== '' && from <= to;
  const validRange =
    orderedRange && (Date.parse(to) - Date.parse(from)) / 86_400_000 < 366;
  const multipleEmployees = employeeId === MULTIPLE_EMPLOYEES;
  const employeeIds = multipleEmployees ? selectedEmployeeIds : undefined;
  const singleEmployeeId = multipleEmployees
    ? undefined
    : employeeId || undefined;
  const validSelection = !multipleEmployees || selectedEmployeeIds.length > 0;

  const employees = useQuery({
    queryKey: ['employees', 'working-time-report'],
    queryFn: () => api.workingTimeReportEmployees(),
    enabled: isAuthorized,
  });
  const availableEmployees = employees.data ?? [];
  const report = useQuery({
    queryKey: [
      'working-time-report',
      from,
      to,
      singleEmployeeId ?? null,
      employeeIds ?? null,
      includeLocations,
    ],
    queryFn: () =>
      api.workingTimeReport(
        from,
        to,
        singleEmployeeId,
        includeLocations,
        employeeIds,
      ),
    enabled: isAuthorized && validRange && validSelection,
  });
  const canDownload =
    validRange &&
    validSelection &&
    !report.isFetching &&
    !report.isError &&
    !pdfPending &&
    Boolean(report.data?.rows.length);

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground">{t('reports.adminOnly')}</p>
    );
  }
  const downloadCsv = () => {
    if (!canDownload || !report.data) return;
    const csv = workingTimeReportToCsv(
      report.data,
      {
        date: t('reports.date'),
        employee: t('common.employee'),
        start: t('reports.start'),
        clockInLocation: t('reports.clockInLocation'),
        end: t('reports.end'),
        clockOutLocation: t('reports.clockOutLocation'),
        gross: t('reports.gross'),
        break: t('reports.break'),
        net: t('reports.net'),
        status: t('common.status'),
        total: t('reports.total'),
      },
      languageTag,
      enumLabel,
      includeLocations,
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arbeitszeiten-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadPdf = async () => {
    if (!canDownload) return;
    const params = new URLSearchParams({ from, to, locale });
    if (singleEmployeeId) params.set('employeeId', singleEmployeeId);
    employeeIds?.forEach((id) => params.append('employeeIds', id));
    setPdfFailed(false);
    setPdfPending(true);
    try {
      await downloadAuthenticated(
        `/api/reports/working-times.pdf?${params.toString()}`,
        `arbeitszeiten-${from}-${to}.pdf`,
      );
    } catch {
      setPdfFailed(true);
    } finally {
      setPdfPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('reports.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('reports.description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.filters')}</CardTitle>
          <CardDescription>{t('reports.rangeHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="working-time-from">{t('common.from')}</Label>
              <Input
                id="working-time-from"
                type="date"
                value={from}
                max={to || undefined}
                disabled={pdfPending}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="working-time-to">{t('common.to')}</Label>
              <Input
                id="working-time-to"
                type="date"
                value={to}
                min={from || undefined}
                disabled={pdfPending}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div className="min-w-56 space-y-1">
              <Label htmlFor="working-time-employee">
                {t('common.employee')}
              </Label>
              <select
                id="working-time-employee"
                value={employeeId}
                disabled={
                  pdfPending || employees.isPending || employees.isError
                }
                onChange={(event) => setEmployeeId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('common.all')}</option>
                <option value={MULTIPLE_EMPLOYEES}>
                  {t('reports.selectMultiple')}
                </option>
                {availableEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex h-10 items-center gap-2">
              <input
                id="working-time-include-locations"
                type="checkbox"
                className="h-4 w-4"
                checked={includeLocations}
                disabled={pdfPending}
                onChange={(event) => setIncludeLocations(event.target.checked)}
              />
              <Label htmlFor="working-time-include-locations">
                {t('reports.includeLocations')}
              </Label>
            </div>
            <Button
              variant="outline"
              disabled={!canDownload}
              onClick={downloadCsv}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('reports.downloadCsv')}
            </Button>
            <Button
              variant="outline"
              disabled={!canDownload}
              aria-busy={pdfPending}
              onClick={downloadPdf}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {t(pdfPending ? 'reports.preparingPdf' : 'reports.downloadPdf')}
            </Button>
          </div>
          {multipleEmployees && (
            <fieldset
              className="mt-4 rounded-md border p-3"
              disabled={pdfPending}
            >
              <legend className="px-1 text-sm font-medium">
                {t('reports.selectEmployees')}
              </legend>
              <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {availableEmployees.map((employee) => (
                  <label
                    key={employee.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedEmployeeIds.includes(employee.id)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedEmployeeIds((selected) =>
                          checked
                            ? [...selected, employee.id].sort()
                            : selected.filter((id) => id !== employee.id),
                        );
                      }}
                    />
                    {employee.firstName} {employee.lastName}
                  </label>
                ))}
              </div>
              {!validSelection && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('reports.selectionRequired')}
                </p>
              )}
            </fieldset>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {t('reports.pdfHint')}
          </p>
          {!validRange && (
            <p className="mt-3 text-sm text-destructive">
              {t(
                orderedRange ? 'reports.rangeTooLong' : 'reports.invalidRange',
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {pdfFailed && (
        <Alert variant="destructive">
          <AlertTitle>{t('reports.pdfFailed')}</AlertTitle>
          <AlertDescription>{t('reports.pdfRetry')}</AlertDescription>
        </Alert>
      )}

      {report.isError && (
        <Alert variant="destructive">
          <AlertTitle>{t('reports.loadFailed')}</AlertTitle>
          <AlertDescription>{report.error.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.result')}</CardTitle>
          <CardDescription>{t('reports.projectIndependent')}</CardDescription>
        </CardHeader>
        <CardContent>
          {report.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('common.loading')}
            </p>
          ) : report.data && report.data.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table
                className={`w-full ${includeLocations ? 'min-w-[1180px]' : 'min-w-[860px]'} text-sm`}
              >
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">{t('reports.date')}</th>
                    <th className="py-2 pr-3">{t('common.employee')}</th>
                    <th className="py-2 pr-3">{t('reports.start')}</th>
                    {includeLocations && (
                      <th className="py-2 pr-3">
                        {t('reports.clockInLocation')}
                      </th>
                    )}
                    <th className="py-2 pr-3">{t('reports.end')}</th>
                    {includeLocations && (
                      <th className="py-2 pr-3">
                        {t('reports.clockOutLocation')}
                      </th>
                    )}
                    <th className="py-2 pr-3 text-right">
                      {t('reports.gross')}
                    </th>
                    <th className="py-2 pr-3 text-right">
                      {t('reports.break')}
                    </th>
                    <th className="py-2 pr-3 text-right">{t('reports.net')}</th>
                    <th className="py-2">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3">
                        {row.date}
                      </td>
                      <td className="py-2 pr-3">{row.employeeName}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {formatTime(row.clockIn, languageTag)}
                      </td>
                      {includeLocations && (
                        <td className="py-2 pr-3">
                          {formatLocation(row.clockInLocation, languageTag)}
                        </td>
                      )}
                      <td className="whitespace-nowrap py-2 pr-3">
                        {formatTime(row.clockOut, languageTag)}
                      </td>
                      {includeLocations && (
                        <td className="py-2 pr-3">
                          {formatLocation(row.clockOutLocation, languageTag)}
                        </td>
                      )}
                      <td className="py-2 pr-3 text-right">
                        {formatMinutes(row.grossMinutes)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {formatMinutes(row.breakMinutes)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {formatMinutes(row.netMinutes)}
                      </td>
                      <td className="py-2">{enumLabel(row.status)}</td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td
                      className="py-3 pr-3"
                      colSpan={includeLocations ? 6 : 4}
                    >
                      {t('reports.total')}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      {formatMinutes(report.data.totals.grossMinutes)}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      {formatMinutes(report.data.totals.breakMinutes)}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      {formatMinutes(report.data.totals.netMinutes)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('reports.empty')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
