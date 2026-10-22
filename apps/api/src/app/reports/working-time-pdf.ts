import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { WorkingTimeReportRowDto } from './reports.dto';

export interface WorkingTimePdfEmployee {
  id: string;
  personalNo: string;
  firstName: string;
  lastName: string;
  openEntryCount: number;
  rows: WorkingTimeReportRowDto[];
}

export interface WorkingTimePdfInput {
  from: string;
  to: string;
  timeZone: string;
  generatedAt: Date;
  locale: 'de' | 'en';
  employees: WorkingTimePdfEmployee[];
}

const labels = {
  de: {
    title: 'Arbeitszeitnachweis',
    personalNo: 'Personalnummer',
    employeeId: 'Mitarbeiter-ID',
    period: 'Zeitraum',
    timeZone: 'Zeitzone',
    generated: 'Erstellt',
    bookingDay: 'Buchungstag\nnach Beginn',
    start: 'Beginn\nDatum, Uhrzeit, UTC-Offset',
    end: 'Ende\nDatum, Uhrzeit, UTC-Offset',
    gross: 'Brutto\nh:mm:ss',
    break: 'Pausenabzug\nh:mm:ss',
    net: 'Netto\nh:mm:ss',
    status: 'Status',
    dayTotal: 'Tagessumme',
    periodTotal: 'Zeitraumsumme',
    noEntries: 'Keine abgeschlossenen Buchungen im gewählten Zeitraum.',
    noEmployees: 'Keine Mitarbeiter:innen für diesen Export vorhanden.',
    openWarning:
      'Nicht enthalten: {count} laufende Buchung(en) ohne Ende. Sie fehlen auch in den Summen.',
    provisionalWarning:
      'Vorläufig: {count} abgeschlossene Buchung(en) sind noch nicht genehmigt und in den Summen enthalten.',
    intervalNote:
      'Zuordnung nach dem lokalen Tag des Beginns. Intervalle über Mitternacht bleiben vollständig erhalten; sie werden nicht an den Zeitraumgrenzen gekürzt. Abgelehnte und stornierte Buchungen sind ausgeschlossen.',
    breakNote:
      'Pausenabzüge werden automatisch nach den konfigurierten Regeln berechnet; sie belegen keine tatsächlichen Pausenzeiten. Dauerangaben in h:mm:ss, auf Sekunden gerundet. Pausenabzug = angezeigte Brutto- minus Nettozeit; Summen aus den gerundeten Werten.',
    pending: 'Ausstehend (vorläufig)',
    open: 'Offen (vorläufig)',
    approved: 'Genehmigt',
    page: 'Seite',
    of: 'von',
  },
  en: {
    title: 'Working time record',
    personalNo: 'Personnel number',
    employeeId: 'Employee ID',
    period: 'Period',
    timeZone: 'Time zone',
    generated: 'Generated',
    bookingDay: 'Booking day\nby start',
    start: 'Start\nDate, time, UTC offset',
    end: 'End\nDate, time, UTC offset',
    gross: 'Gross\nh:mm:ss',
    break: 'Break deduction\nh:mm:ss',
    net: 'Net\nh:mm:ss',
    status: 'Status',
    dayTotal: 'Day total',
    periodTotal: 'Period total',
    noEntries: 'No closed entries in the selected period.',
    noEmployees: 'No employees available for this export.',
    openWarning:
      'Excluded: {count} running entry/entries without an end. They are also excluded from totals.',
    provisionalWarning:
      'Provisional: {count} closed entry/entries are not yet approved and are included in totals.',
    intervalNote:
      'Assigned by the local start day. Overnight intervals remain complete and are not clipped at the period boundaries. Rejected and voided entries are excluded.',
    breakNote:
      'Break deductions are calculated automatically from the configured rules; they do not document actual break times. Durations use h:mm:ss, rounded to seconds. Break deduction = displayed gross minus net; totals sum these rounded values.',
    pending: 'Pending (provisional)',
    open: 'Open (provisional)',
    approved: 'Approved',
    page: 'Page',
    of: 'of',
  },
} as const;

const MARGIN = 32;
const CELL_PADDING = 6;
const ROW_HEIGHT = 32;
const TOTAL_HEIGHT = 23;
const TEXT_COLOR = '#172033';
const MUTED_COLOR = '#526076';
const BORDER_COLOR = '#d5dce5';

function fontPath(fileName: string): string | undefined {
  return [
    join(__dirname, 'assets/fonts', fileName),
    join(__dirname, '../../assets/fonts', fileName),
  ].find((candidate) => existsSync(candidate));
}

function seconds(minutes: number): number {
  return Math.max(0, Math.round(minutes * 60));
}

function rowAmounts(row: WorkingTimeReportRowDto): [number, number, number] {
  const gross = seconds(row.grossMinutes);
  const net = seconds(row.netMinutes);
  return [gross, gross - net, net];
}

function duration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${(totalSeconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

function calendarDate(
  value: string,
  locale: WorkingTimePdfInput['locale'],
): string {
  const [year, month, day] = value.split('-');
  return locale === 'de' ? `${day}.${month}.${year}` : value;
}

function identityText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function localTimestamp(value: Date, timeZone: string): [string, string] {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return [
    `${part('year')}-${part('month')}-${part('day')}`,
    `${part('hour')}:${part('minute')}:${part('second')} ${part('timeZoneName')}`,
  ];
}

/** A snapshot of recorded intervals, without location or project data. */
export async function renderWorkingTimePdf(
  input: WorkingTimePdfInput,
): Promise<Buffer> {
  const regularFont = fontPath('NotoSans-Regular.ttf');
  if (!regularFont)
    throw new Error('The bundled working-time PDF font is missing');
  const boldFont = fontPath('NotoSans-Bold.ttf') ?? regularFont;
  const text = labels[input.locale];
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: MARGIN,
    autoFirstPage: false,
    bufferPages: true,
    font: regularFont,
    info: {
      Title: text.title,
      Author: 'OpenClockwork',
      Subject: `${input.from} - ${input.to} (${input.timeZone})`,
      CreationDate: input.generatedAt,
      ModDate: input.generatedAt,
    },
  });
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.registerFont('Regular', regularFont);
  doc.registerFont('Bold', boldFont);

  const pageWidth = 841.89;
  const contentWidth = pageWidth - MARGIN * 2;
  const columns = [
    { label: text.bookingDay, width: 80, align: 'left' },
    { label: text.start, width: 157, align: 'left' },
    { label: text.end, width: 157, align: 'left' },
    { label: text.gross, width: 73, align: 'right' },
    { label: text.break, width: 87, align: 'right' },
    { label: text.net, width: 73, align: 'right' },
    { label: text.status, width: contentWidth - 627, align: 'left' },
  ] as const;
  const period = `${calendarDate(input.from, input.locale)} - ${calendarDate(input.to, input.locale)}`;
  const generated = localTimestamp(input.generatedAt, input.timeZone);
  const generatedLabel = `${calendarDate(generated[0], input.locale)} ${generated[1]}`;
  let y = MARGIN;

  const paragraph = (
    value: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: string;
      gap?: number;
    } = {},
  ) => {
    doc
      .font(options.bold ? 'Bold' : 'Regular')
      .fontSize(options.size ?? 8)
      .fillColor(options.color ?? TEXT_COLOR);
    const height = doc.heightOfString(value, {
      width: contentWidth,
      lineGap: 1,
    });
    doc.text(value, MARGIN, y, { width: contentWidth, lineGap: 1 });
    y += height + (options.gap ?? 4);
  };

  const drawColumns = () => {
    const headerHeight = 34;
    doc.rect(MARGIN, y, contentWidth, headerHeight).fill('#e9eef5');
    let x = MARGIN;
    for (const column of columns) {
      doc
        .font('Bold')
        .fontSize(7.5)
        .fillColor(TEXT_COLOR)
        .text(column.label, x + CELL_PADDING, y + 5, {
          width: column.width - CELL_PADDING * 2,
          align: column.align,
          lineGap: 1,
        });
      x += column.width;
    }
    y += headerHeight;
  };

  const startPage = (employee: WorkingTimePdfEmployee, firstPage: boolean) => {
    doc.addPage();
    y = MARGIN;
    paragraph(`OpenClockwork | ${text.title}`, {
      size: 16,
      bold: true,
      gap: 7,
    });
    paragraph(identityText(`${employee.firstName} ${employee.lastName}`), {
      size: 12,
      bold: true,
    });
    paragraph(
      `${text.personalNo}: ${identityText(employee.personalNo)}  |  ${text.employeeId}: ${identityText(employee.id)}`,
      { size: 8 },
    );
    paragraph(
      `${text.period}: ${period}  |  ${text.timeZone}: ${input.timeZone}`,
      { size: 8 },
    );
    paragraph(`${text.generated}: ${generatedLabel}`, {
      size: 7.5,
      color: MUTED_COLOR,
      gap: 7,
    });
    if (employee.openEntryCount > 0) {
      paragraph(
        text.openWarning.replace('{count}', String(employee.openEntryCount)),
        {
          bold: true,
          size: 8,
          color: '#9a3412',
          gap: 5,
        },
      );
    }
    const provisional = employee.rows.filter(
      (row) => row.status !== 'Approved',
    ).length;
    if (provisional > 0) {
      paragraph(
        text.provisionalWarning.replace('{count}', String(provisional)),
        {
          bold: true,
          size: 8,
          color: '#854d0e',
          gap: 5,
        },
      );
    }
    if (firstPage) {
      paragraph(text.intervalNote, { size: 7.5, color: MUTED_COLOR });
      paragraph(text.breakNote, { size: 7.5, color: MUTED_COLOR, gap: 9 });
    }
    drawColumns();
  };

  const ensureSpace = (height: number, employee: WorkingTimePdfEmployee) => {
    if (y + height > doc.page.height - MARGIN - 26) startPage(employee, false);
  };

  const totals = (
    value: string,
    rows: WorkingTimeReportRowDto[],
    periodTotal: boolean,
  ) => {
    const amounts = rows.reduce(
      (sum, row) => {
        const values = rowAmounts(row);
        return sum.map((amount, index) => amount + values[index]);
      },
      [0, 0, 0],
    );
    doc
      .rect(MARGIN, y, contentWidth, TOTAL_HEIGHT)
      .fill(periodTotal ? '#dbe6f3' : '#f2f5f9');
    doc
      .font('Bold')
      .fontSize(8)
      .fillColor(TEXT_COLOR)
      .text(value, MARGIN + CELL_PADDING, y + 6, {
        width: 394 - CELL_PADDING * 2,
      });
    let x = MARGIN + 394;
    for (let index = 0; index < amounts.length; index += 1) {
      const width = columns[index + 3].width;
      doc.text(duration(amounts[index]), x + CELL_PADDING, y + 6, {
        width: width - CELL_PADDING * 2,
        align: 'right',
      });
      x += width;
    }
    y += TOTAL_HEIGHT;
  };

  for (const employee of input.employees) {
    startPage(employee, true);
    const rows = [...employee.rows].sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.clockIn.localeCompare(right.clockIn) ||
        left.id.localeCompare(right.id),
    );
    if (rows.length === 0) {
      y += 10;
      paragraph(text.noEntries, { size: 9, gap: 10 });
    }
    let dayRows: WorkingTimeReportRowDto[] = [];
    rows.forEach((row, index) => {
      const lastOfDay = rows[index + 1]?.date !== row.date;
      const finalTotalsHeight =
        index === rows.length - 1 ? TOTAL_HEIGHT + 6 : 0;
      ensureSpace(
        ROW_HEIGHT + (lastOfDay ? TOTAL_HEIGHT : 0) + finalTotalsHeight,
        employee,
      );
      const start = localTimestamp(new Date(row.clockIn), input.timeZone);
      const end = localTimestamp(new Date(row.clockOut), input.timeZone);
      const status =
        row.status === 'Approved'
          ? text.approved
          : row.status === 'Pending'
            ? text.pending
            : text.open;
      const values = [
        calendarDate(row.date, input.locale),
        `${calendarDate(start[0], input.locale)}\n${start[1]}`,
        `${calendarDate(end[0], input.locale)}\n${end[1]}`,
        ...rowAmounts(row).map(duration),
        status,
      ];
      let x = MARGIN;
      values.forEach((value, columnIndex) => {
        const column = columns[columnIndex];
        doc
          .font('Regular')
          .fontSize(8)
          .fillColor(TEXT_COLOR)
          .text(value, x + CELL_PADDING, y + 5, {
            width: column.width - CELL_PADDING * 2,
            align: column.align,
            lineGap: 1,
          });
        x += column.width;
      });
      y += ROW_HEIGHT;
      doc
        .moveTo(MARGIN, y)
        .lineTo(MARGIN + contentWidth, y)
        .strokeColor(BORDER_COLOR)
        .lineWidth(0.4)
        .stroke();
      dayRows.push(row);
      if (lastOfDay) {
        totals(
          `${text.dayTotal} ${calendarDate(row.date, input.locale)}`,
          dayRows,
          false,
        );
        dayRows = [];
      }
    });
    ensureSpace(TOTAL_HEIGHT + 6, employee);
    y += 6;
    totals(text.periodTotal, rows, true);
  }

  if (input.employees.length === 0) {
    doc.addPage();
    y = MARGIN;
    paragraph(`OpenClockwork | ${text.title}`, {
      size: 16,
      bold: true,
      gap: 10,
    });
    paragraph(
      `${text.period}: ${period}  |  ${text.timeZone}: ${input.timeZone}`,
    );
    paragraph(`${text.generated}: ${generatedLabel}`);
    paragraph(text.noEmployees, { size: 10 });
  }

  const pageRange = doc.bufferedPageRange();
  for (
    let index = pageRange.start;
    index < pageRange.start + pageRange.count;
    index += 1
  ) {
    doc.switchToPage(index);
    // The reserved footer lies outside the body's bottom margin.
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - MARGIN + 7;
    doc
      .moveTo(MARGIN, footerY - 7)
      .lineTo(MARGIN + contentWidth, footerY - 7)
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.5)
      .stroke();
    doc
      .font('Regular')
      .fontSize(7)
      .fillColor(MUTED_COLOR)
      .text('OpenClockwork', MARGIN, footerY, {
        width: contentWidth / 2,
        lineBreak: false,
      });
    doc.text(
      `${text.page} ${index + 1} ${text.of} ${pageRange.count}`,
      MARGIN + contentWidth / 2,
      footerY,
      {
        width: contentWidth / 2,
        align: 'right',
        lineBreak: false,
      },
    );
  }
  doc.end();
  return result;
}
