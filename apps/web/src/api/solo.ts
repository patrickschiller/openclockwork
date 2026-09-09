import {
  request,
  type ProjectDto,
  type ServiceOrderDto,
  type TimeEntryDto,
} from './client';

export interface SoloPolicy {
  id: string | null;
  effectiveFrom: string;
  targetEnabled: boolean;
  weeklyTargetMinutes: number | null;
  workingDays: number;
  leaveEnabled: boolean;
  annualLeaveDays: number;
  carryOverDays: number;
  carryOverExpiresOn: string | null;
  leaveAdjustmentDays: number;
  leaveAdjustmentReason: string | null;
  leaveAllowanceYear: number;
  holidayCalendar: string;
  holidayDates: string[];
  breakRules: { afterMinutes: number; breakMinutes: number }[];
  coreTimeHintsEnabled: boolean;
  frameStart: string;
  frameEnd: string;
  coreTimes: { start: string; end: string; weekdays: number; label?: string }[];
  dailyBlockEnabled: boolean;
  gpsEnabled: boolean;
}
export interface Installation {
  mode: 'Team' | 'Solo';
  ownerEmployeeId: string | null;
  setupCompleted: boolean;
  revision: number;
  timeZone: string;
  capabilities: {
    isOwner: boolean;
    solo: boolean;
    targets: boolean;
    leave: boolean;
    coreTimeHints: boolean;
    dailyBlock: boolean;
    gps: boolean;
  };
  policy: SoloPolicy;
  futurePolicies?: SoloPolicy[];
}
export interface SoloEntry extends TimeEntryDto {
  note: string | null;
  revision: number;
  billable: boolean;
  voidedAt: string | null;
  captureGroupId: string | null;
  approvalMode: string;
}
export interface Customer {
  id: string;
  name: string;
  code: string | null;
  note: string | null;
  isActive: boolean;
  projectCount: number;
}
export interface SoloOrder extends ServiceOrderDto {
  defaultBillable: boolean | null;
  bookedNetMinutes?: number;
}
export interface SoloProject extends ProjectDto {
  customerId: string | null;
  customerName: string | null;
  defaultBillable: boolean;
  bookedNetMinutes?: number;
  serviceOrders: SoloOrder[];
}
export interface PersonalDay {
  id: string;
  kind: 'Free' | 'Vacation' | 'Sickness' | 'Training';
  from: string;
  to: string;
  note: string | null;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  revision: number;
  cancelledAt: string | null;
}
export interface SoloSummary {
  targetEnabled: boolean;
  leaveEnabled: boolean;
  targetMinutes: number | null;
  actualMinutes: number;
  overtimeMinutes: number | null;
  vacationDaysTotal: number | null;
  vacationDaysUsed: number | null;
  vacationDaysRemaining: number | null;
  from: string;
  to: string;
  timeZone: string;
}
export interface ReportRow {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  serviceOrderId: string | null;
  orderNo: string | null;
  orderTitle: string | null;
  activity: string | null;
  billable: boolean;
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  billableNetMinutes: number;
}
export interface SoloReport {
  from: string;
  to: string;
  timeZone: string;
  timeDefinition: string;
  rows: ReportRow[];
  totals: {
    grossMinutes: number;
    breakMinutes: number;
    netMinutes: number;
    billableNetMinutes: number;
  };
  openTimerCount: number;
}
export interface AuditEvent {
  id: string;
  action: string;
  occurredAt: string;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export const soloApi = {
  installation: () => request<Installation>('/api/installation'),
  profile: (payload: { firstName: string; lastName: string; email: string }) =>
    send<{ firstName: string; lastName: string; email: string }>(
      '/api/auth/me',
      'PATCH',
      payload,
    ),
  settings: (payload: Omit<SoloPolicy, 'id'> & { revision: number }) =>
    send<Installation>('/api/installation/settings', 'PATCH', payload),
  completeSetup: () =>
    send<Installation>('/api/installation/complete-setup', 'POST', {}),
  modePreview: (mode: Installation['mode']) =>
    send<{ allowed: boolean; blockers: string[] }>(
      '/api/installation/mode-preview',
      'POST',
      { mode },
    ),
  mode: (mode: Installation['mode'], revision: number) =>
    send<Installation>('/api/installation/mode', 'POST', { mode, revision }),
  password: (currentPassword: string, newPassword: string) =>
    send<void>('/api/auth/password', 'POST', { currentPassword, newPassword }),
  summary: (from: string, to: string) =>
    request<SoloSummary>(
      `/api/installation/summary?${new URLSearchParams({ from, to })}`,
    ),
  entries: (employeeId: string) =>
    request<SoloEntry[]>(
      `/api/timeentries?${new URLSearchParams({ employeeId })}`,
    ),
  start: (payload: object) =>
    send<SoloEntry>('/api/timeentries/clock-in', 'POST', payload),
  stop: (id: string, revision: number) =>
    send<SoloEntry>('/api/timeentries/clock-out', 'POST', { id, revision }),
  manual: (payload: object) =>
    send<SoloEntry>('/api/timeentries/manual', 'POST', payload),
  correct: (id: string, payload: object) =>
    send<SoloEntry>(`/api/timeentries/${id}/correct`, 'PATCH', payload),
  void: (id: string, revision: number, reason: string) =>
    send<SoloEntry>(`/api/timeentries/${id}/void`, 'POST', {
      revision,
      reason,
    }),
  switchProject: (id: string, payload: object) =>
    send<{ first: SoloEntry; second: SoloEntry }>(
      `/api/timeentries/${id}/switch-project`,
      'POST',
      payload,
    ),
  split: (id: string, payload: object) =>
    send<{ first: SoloEntry; second: SoloEntry }>(
      `/api/timeentries/${id}/split`,
      'POST',
      payload,
    ),
  audit: (id: string) => request<AuditEvent[]>(`/api/timeentries/${id}/audit`),
  customers: () => request<Customer[]>('/api/customers?includeInactive=true'),
  saveCustomer: (id: string | null, payload: object) =>
    send<Customer>(
      `/api/customers${id ? `/${id}` : ''}`,
      id ? 'PUT' : 'POST',
      payload,
    ),
  deleteCustomer: (id: string) => send<void>(`/api/customers/${id}`, 'DELETE'),
  projects: () => request<SoloProject[]>('/api/projects?includeInactive=true'),
  bookableProjects: (employeeId: string) =>
    request<SoloProject[]>(
      `/api/projects/bookable?${new URLSearchParams({ employeeId })}`,
    ),
  saveProject: (id: string | null, payload: object) =>
    send<SoloProject>(
      `/api/projects${id ? `/${id}` : ''}`,
      id ? 'PUT' : 'POST',
      payload,
    ),
  saveOrder: (projectId: string, id: string | null, payload: object) =>
    send<SoloOrder>(
      `/api/projects/${projectId}/service-orders${id ? `/${id}` : ''}`,
      id ? 'PUT' : 'POST',
      payload,
    ),
  days: () => request<PersonalDay[]>('/api/installation/days'),
  saveDay: (id: string | null, payload: object) =>
    send<PersonalDay>(
      `/api/installation/days${id ? `/${id}` : ''}`,
      id ? 'PATCH' : 'POST',
      payload,
    ),
  cancelDay: (id: string, revision: number) =>
    send<PersonalDay>(`/api/installation/days/${id}`, 'DELETE', { revision }),
  dayAudit: (id: string) =>
    request<AuditEvent[]>(`/api/installation/days/${id}/audit`),
  installationEvents: () => request<AuditEvent[]>('/api/installation/events'),
  hints: (from: string, to: string) =>
    request<{
      enabled: boolean;
      hints: {
        date: string;
        kind:
          | 'BeforeFrame'
          | 'AfterFrame'
          | 'LateArrival'
          | 'EarlyDeparture'
          | 'MidDayGap';
        boundary: string;
        deltaMinutes: number;
        windowLabel?: string;
      }[];
    }>(`/api/installation/hints?${new URLSearchParams({ from, to })}`),
  dailyBlock: (payload: object) =>
    send<SoloEntry>('/api/timeentries/daily-block', 'POST', payload),
  dailyBlockOption: (date: string) =>
    request<{
      enabled: boolean;
      dailyNetMinutes: number;
      grossMinutes: number;
      breakMinutes: number;
    }>(`/api/timeentries/daily-block/option?${new URLSearchParams({ date })}`),
  report: (params: URLSearchParams) =>
    request<SoloReport>(`/api/reports/solo?${params}`),
};
function send<T>(path: string, method: string, payload?: object) {
  return request<T>(path, {
    method,
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
