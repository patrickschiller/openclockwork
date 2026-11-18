import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock
    .mockReset()
    .mockImplementation(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    );
});
afterEach(() => vi.unstubAllGlobals());
describe('handwritten cockpit transport', () => {
  it('loads authoritative overview, scoped pending corrections and selected-employee booking assignments', async () => {
    await api.teamCockpit();
    await api.teamCockpitApprovalRequests();
    await api.teamCockpitBookingTargets('beneficiary');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/team-cockpit',
      '/api/team-cockpit/approval-requests',
      '/api/team-cockpit/employees/beneficiary/booking-targets',
    ]);
  });
  it('preserves the full opaque keyset cursor and explicit bounded date range', async () => {
    await api.teamCockpitHistory('beneficiary', {
      from: '2026-01-01',
      to: '2026-12-31',
      limit: 200,
      cursor: 'opaque+/=&next',
    });
    const url = new URL(
      fetchMock.mock.calls[0][0],
      'https://clockwork.invalid',
    );
    expect(url.pathname).toBe(
      '/api/team-cockpit/employees/beneficiary/history',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
      limit: '200',
      cursor: 'opaque+/=&next',
    });
  });
  it('sends proxy payloads only to the selected beneficiary endpoints', async () => {
    const clock = {
      reason: 'Operational cover',
      projectId: 'assigned-project',
      serviceOrderId: 'assigned-order',
      activity: 'Support',
      billable: true,
      note: 'Project work',
    };
    const manual = {
      ...clock,
      clockIn: '2026-10-25T00:30:00.000Z',
      clockOut: '2026-10-25T02:30:00.000Z',
    };
    const absence = {
      kind: 'Sickness' as const,
      from: '2026-11-06',
      to: '2026-11-07',
      proxyReason: 'Reported by employee',
    };
    const request = {
      type: 'Vacation' as const,
      from: '2026-11-09',
      to: '2026-11-10',
      halfDayStart: true,
      substituteId: 'substitute',
      reason: 'Family event',
      proxyReason: 'Submitted by phone',
    };
    await api.teamCockpitClockIn('beneficiary', clock);
    await api.teamCockpitManual('beneficiary', manual);
    await api.teamCockpitRecordAbsence('beneficiary', absence);
    await api.teamCockpitRequestAbsence('beneficiary', request);
    for (const [index, [action, payload]] of [
      ['clock-in', clock],
      ['manual', manual],
      ['absences', absence],
      ['requests', request],
    ].entries()) {
      expect(fetchMock.mock.calls[index][0]).toBe(
        `/api/team-cockpit/employees/beneficiary/${action}`,
      );
      expect(fetchMock.mock.calls[index][1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
  });
  it('sends the displayed optimistic version for every correction decision without changing older callers', async () => {
    const version = '2026-11-06T17:00:00.000Z';
    await api.managerApprove('request', 'manager', 'Checked', true, version);
    await api.managerReject('request', 'manager', 'Wrong time', version);
    await api.hrConfirm('request', 'hr', undefined, version);
    await api.hrReject('request', 'hr', 'Wrong time', version);
    for (const call of fetchMock.mock.calls)
      expect(JSON.parse(call[1].body)).toMatchObject({
        expectedUpdatedAt: version,
      });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      requiresHrConfirmation: true,
    });
    await api.hrConfirm('legacy', 'hr');
    expect(JSON.parse(fetchMock.mock.calls[4][1].body)).toEqual({
      actorId: 'hr',
      note: null,
    });
  });
});
