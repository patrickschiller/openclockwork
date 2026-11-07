import { describe, expect, it } from 'vitest';
import type {
  CockpitHistoryDto,
  CockpitHistoryItemDto,
} from '../../api/client';
import {
  historyDayCount,
  historyDays,
  historyItemDays,
  historyPreset,
  historyStatus,
  isHistoryDate,
  nextHistoryCursor,
  uniqueHistoryItems,
  validHistoryPeriod,
} from './cockpit-history';

const history = {
  from: '2026-10-01',
  to: '2026-11-30',
  timeZone: 'Europe/Berlin',
  generatedAt: '2026-11-07T10:00:00Z',
};
const item = (
  overrides: Partial<CockpitHistoryItemDto> = {},
): CockpitHistoryItemDto => ({
  kind: 'TimeEntry',
  id: 'entry',
  employeeId: 'employee',
  from: '2026-10-31T22:00:00Z',
  to: '2026-11-01T01:00:00Z',
  allDay: false,
  classification: 'Work',
  status: 'Approved',
  workflowState: null,
  halfDayStart: false,
  halfDayEnd: false,
  projectName: null,
  serviceOrderTitle: null,
  grossMinutes: null,
  breakMinutes: null,
  netMinutes: null,
  requiresApproval: false,
  reason: null,
  request: null,
  proxyActions: [],
  ...overrides,
});
const page = (
  items: CockpitHistoryItemDto[],
  nextCursor: string | null = null,
): CockpitHistoryDto => ({
  ...history,
  items,
  nextCursor,
  employee: {
    id: 'employee',
    firstName: 'Demo',
    lastName: 'Person',
    isActive: true,
  },
});

describe('cockpit history calendar semantics', () => {
  it('selects complete month, quarter and leap year without truncating to 365 days', () => {
    expect(historyPreset('month', '2024-02-29')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
    expect(historyPreset('quarter', '2026-11-07')).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    });
    const year = historyPreset('year', '2024-02-29');
    expect(year).toEqual({ from: '2024-01-01', to: '2024-12-31' });
    expect(historyDayCount(year)).toBe(366);
    expect(historyDays(year)).toHaveLength(366);
  });
  it('validates real dates, ordering and the inclusive 1830-day limit', () => {
    expect(isHistoryDate('2026-02-29')).toBe(false);
    expect(isHistoryDate('2024-02-29')).toBe(true);
    expect(validHistoryPeriod({ from: '', to: '2026-01-01' })).toBe(false);
    expect(validHistoryPeriod({ from: '2026-02-02', to: '2026-02-01' })).toBe(
      false,
    );
    const from = '2021-01-01';
    const end = (days: number) =>
      new Date(Date.parse(from) + (days - 1) * 86400000)
        .toISOString()
        .slice(0, 10);
    expect(validHistoryPeriod({ from, to: end(1830) })).toBe(true);
    expect(validHistoryPeriod({ from, to: end(1831) })).toBe(false);
  });
  it('keeps inclusive all-day ends and unanchored half-day dates', () => {
    expect(
      historyItemDays(
        item({
          kind: 'Request',
          allDay: true,
          from: '2026-10-31',
          to: '2026-11-02',
          halfDayStart: true,
          halfDayEnd: true,
        }),
        history,
      ),
    ).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });
  it('uses the declared timezone, exclusive midnight and cross-month overlap', () => {
    expect(historyItemDays(item(), history)).toEqual([
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(
      historyItemDays(item({ to: '2026-10-31T23:00:00Z' }), history),
    ).toEqual(['2026-10-31']);
    expect(
      historyItemDays(
        item({ from: '2026-09-30T20:00:00Z', to: '2026-10-01T00:00:00Z' }),
        history,
      ),
    ).toEqual(['2026-10-01']);
    expect(
      historyItemDays(
        item({ from: '2026-10-31T22:00:00Z', to: '2026-10-31T23:00:00Z' }),
        { ...history, timeZone: 'America/New_York' },
      ),
    ).toEqual(['2026-10-31']);
  });
  it('handles DST overlap in instant order, not ambiguous local clock order', () => {
    expect(
      historyItemDays(
        item({ from: '2026-10-25T00:45:00Z', to: '2026-10-25T01:15:00Z' }),
        history,
      ),
    ).toEqual(['2026-10-25']);
  });
  it('clips open entries at generatedAt, excludes future open bookings and rejects empty ranges', () => {
    const days = historyItemDays(
      item({ from: '2026-11-06T22:30:00Z', to: null }),
      history,
    );
    expect(days).toEqual(['2026-11-06', '2026-11-07']);
    expect(
      historyItemDays(
        item({ from: '2026-11-08T00:00:00Z', to: null }),
        history,
      ),
    ).toEqual([]);
    expect(
      historyItemDays(
        item({ from: '2026-11-07T10:00:00Z', to: null }),
        history,
      ),
    ).toEqual([]);
  });
  it('deduplicates by kind/id, preserving distinct kinds with the same ID and all workflow states', () => {
    const duplicate = item();
    const request = item({
      kind: 'Request',
      workflowState: 'Draft',
      status: 'Submitted',
    });
    const result = uniqueHistoryItems([
      page([duplicate]),
      page([duplicate, request]),
    ]);
    expect(result).toHaveLength(2);
    expect(historyStatus(request)).toBe('Draft');
    expect(
      historyStatus(item({ status: 'Pending', workflowState: 'PendingHr' })),
    ).toBe('PendingHr');
    expect(
      historyStatus(item({ status: 'Voided', workflowState: 'Approved' })),
    ).toBe('Voided');
    expect(
      historyStatus(item({ kind: 'Request', workflowState: 'Cancelled' })),
    ).toBe('Cancelled');
  });
  it('detects cyclic cursors explicitly instead of silently claiming completion', () => {
    const first = page([], 'cursor-1');
    const second = page([], 'cursor-2');
    expect(nextHistoryCursor(second, [first, second])).toBe('cursor-2');
    expect(() => nextHistoryCursor(first, [first, second, first])).toThrow(
      'Invalid history pagination',
    );
    expect(nextHistoryCursor(page([]), [first, page([])])).toBeUndefined();
  });
});
