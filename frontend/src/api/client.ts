const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export type EmployeeRole = 'Employee' | 'Manager' | 'HRAdmin';
export type TimeModel = 'Teilzeit' | 'Vollzeit' | 'Vertrauensarbeitszeit' | 'Gleitzeit';
export type RequestType = 'Vacation' | 'HomeOffice' | 'SpecialLeave' | 'TimeCorrection';
export type RequestStatus = 'Submitted' | 'Approved' | 'Rejected';
export type EntryStatus = 'Open' | 'Pending' | 'Approved' | 'Rejected';

export interface HealthResponse {
  status: string;
  service: string;
  utcTimestamp: string;
}

export interface EmployeeDto {
  id: string;
  personalNo: string;
  firstName: string;
  lastName: string;
  email: string;
  role: EmployeeRole;
  timeModel: TimeModel;
  weeklyHours: number;
  annualLeaveDays: number;
  managerId: string | null;
  isActive: boolean;
}

export interface TimeSummaryDto {
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
}

export interface TimeEntryDto {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut: string | null;
  source: string;
  status: EntryStatus;
  requiresApproval: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  summary: TimeSummaryDto | null;
}

export interface AccountDto {
  employeeId: string;
  overtimeMinutes: number;
  vacationDaysTotal: number;
  vacationDaysUsed: number;
  vacationDaysRemaining: number;
  asOf: string;
}

export interface RequestDto {
  id: string;
  employeeId: string;
  type: RequestType;
  status: RequestStatus;
  from: string;
  to: string;
  reason: string | null;
  requiresApproval: boolean;
  approverId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface ViolationDto {
  timeEntryId: string;
  employeeId: string;
  kind: string;
  boundary: string;
  deltaMinutes: number;
}

export interface CreateRequestPayload {
  employeeId: string;
  type: RequestType;
  from: string;
  to: string;
  reason: string | null;
}

export interface ClockInPayload {
  employeeId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // body was not JSON
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  employees: () => request<EmployeeDto[]>('/api/employees'),
  account: (employeeId: string) => request<AccountDto>(`/api/accounts/${employeeId}`),
  timeEntries: (employeeId: string, from?: string, to?: string) => {
    const params = new URLSearchParams({ employeeId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request<TimeEntryDto[]>(`/api/timeentries?${params.toString()}`);
  },
  clockIn: (payload: ClockInPayload) =>
    request<TimeEntryDto>('/api/timeentries/clock-in', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  clockOut: (employeeId: string) =>
    request<TimeEntryDto>('/api/timeentries/clock-out', {
      method: 'POST',
      body: JSON.stringify({ employeeId })
    }),
  listRequests: (filters: { employeeId?: string; status?: RequestStatus; approverId?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    if (filters.status) params.set('status', filters.status);
    if (filters.approverId) params.set('approverId', filters.approverId);
    const qs = params.toString();
    return request<RequestDto[]>(`/api/requests${qs ? `?${qs}` : ''}`);
  },
  createRequest: (payload: CreateRequestPayload) =>
    request<RequestDto>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  approveRequest: (id: string, approverId: string, note?: string) =>
    request<RequestDto>(`/api/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approverId, note: note ?? null })
    }),
  rejectRequest: (id: string, approverId: string, note?: string) =>
    request<RequestDto>(`/api/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ approverId, note: note ?? null })
    }),
  violations: (employeeId: string, from?: string, to?: string) => {
    const params = new URLSearchParams({ employeeId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request<ViolationDto[]>(`/api/violations?${params.toString()}`);
  }
};

export async function fetchHealth(): Promise<HealthResponse> {
  return api.health();
}
