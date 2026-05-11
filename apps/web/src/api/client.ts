const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export type EmployeeRole = 'Employee' | 'Manager' | 'HRAdmin';
export type TimeModel = 'Teilzeit' | 'Vollzeit' | 'Vertrauensarbeitszeit' | 'Gleitzeit';
export type RequestType = 'Vacation' | 'HomeOffice' | 'SpecialLeave' | 'TimeAdjustment';
export type RequestStatus = 'Submitted' | 'Approved' | 'Rejected' | 'Cancelled';
export type WorkflowState =
  | 'Draft'
  | 'Submitted'
  | 'PendingSubstitute'
  | 'PendingManager'
  | 'PendingHr'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled';
export type EntryStatus = 'Open' | 'Pending' | 'Approved' | 'Rejected';
export type RequestEventKind =
  | 'Submitted'
  | 'SubstituteAccepted'
  | 'SubstituteDeclined'
  | 'ManagerApproved'
  | 'ManagerRejected'
  | 'HrConfirmed'
  | 'HrRejected'
  | 'Returned'
  | 'Cancelled'
  | 'Resubmitted';

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
  workflowState: WorkflowState;
  from: string;
  to: string;
  reason: string | null;
  requiresApproval: boolean;
  approverId: string | null;
  currentApproverId: string | null;
  substituteId: string | null;
  substituteAcceptedAt: string | null;
  hrConfirmedAt: string | null;
  cancelledAt: string | null;
  calculatedDays: number;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface VacationBalanceDto {
  employeeId: string;
  year: number;
  baseDays: number;
  carryOverDays: number;
  adjustmentDays: number;
  totalEntitlement: number;
  approvedDays: number;
  pendingDays: number;
  remainingDays: number;
  carryOverExpiresOn: string | null;
  adjustmentReason: string | null;
}

export interface LeaveAllowanceDto {
  id: string;
  employeeId: string;
  year: number;
  baseDays: number;
  carryOverDays: number;
  carryOverExpiresOn: string | null;
  adjustmentDays: number;
  adjustmentReason: string | null;
  totalDays: number;
  updatedAt: string;
}

export interface RequestEventDto {
  id: string;
  requestId: string;
  at: string;
  actorId: string;
  kind: RequestEventKind;
  note: string | null;
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

export interface CreateVacationPayload {
  employeeId: string;
  from: string;
  to: string;
  substituteId: string | null;
  reason: string | null;
}

export interface UpsertLeaveAllowancePayload {
  baseDays: number;
  carryOverDays: number;
  carryOverExpiresOn: string | null;
  adjustmentDays: number;
  adjustmentReason: string | null;
}

export interface ClockInPayload {
  employeeId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  employee: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: EmployeeRole;
  };
}

export const TOKEN_STORAGE_KEY = 'openclockwork.accessToken';

function readToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string | string[]; error?: string };
      if (Array.isArray(body?.message)) message = body.message.join('; ');
      else if (typeof body?.message === 'string') message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // body not JSON
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  login: (payload: LoginPayload) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  me: () => request<{ id: string; email: string; role: EmployeeRole }>('/api/auth/me'),
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
      body: JSON.stringify(payload),
    }),
  clockOut: (employeeId: string) =>
    request<TimeEntryDto>('/api/timeentries/clock-out', {
      method: 'POST',
      body: JSON.stringify({ employeeId }),
    }),
  listRequests: (
    filters: {
      employeeId?: string;
      status?: RequestStatus;
      workflowState?: WorkflowState;
      approverId?: string;
      currentApproverId?: string;
      substituteId?: string;
    } = {},
  ) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, String(v));
    const qs = params.toString();
    return request<RequestDto[]>(`/api/requests${qs ? `?${qs}` : ''}`);
  },
  getRequest: (id: string) => request<RequestDto>(`/api/requests/${id}`),
  getRequestEvents: (id: string) => request<RequestEventDto[]>(`/api/requests/${id}/events`),
  createRequest: (payload: CreateRequestPayload) =>
    request<RequestDto>('/api/requests', { method: 'POST', body: JSON.stringify(payload) }),
  createVacationRequest: (payload: CreateVacationPayload) =>
    request<RequestDto>('/api/requests/vacation', { method: 'POST', body: JSON.stringify(payload) }),
  approveRequest: (id: string, actorId: string, note?: string) =>
    request<RequestDto>(`/api/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note: note ?? null }),
    }),
  rejectRequest: (id: string, actorId: string, note?: string) =>
    request<RequestDto>(`/api/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note: note ?? null }),
    }),
  managerApprove: (id: string, actorId: string, note?: string, requiresHrConfirmation = false) =>
    request<RequestDto>(`/api/requests/${id}/manager-approve`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note: note ?? null, requiresHrConfirmation }),
    }),
  managerReject: (id: string, actorId: string, note?: string) =>
    request<RequestDto>(`/api/requests/${id}/manager-reject`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note: note ?? null }),
    }),
  hrConfirm: (id: string, actorId: string, note?: string) =>
    request<RequestDto>(`/api/requests/${id}/hr-confirm`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note: note ?? null }),
    }),
  hrReject: (id: string, actorId: string, note: string) =>
    request<RequestDto>(`/api/requests/${id}/hr-reject`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note }),
    }),
  substituteAccept: (id: string, actorId: string, note?: string) =>
    request<RequestDto>(`/api/requests/${id}/substitute/accept`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note: note ?? null }),
    }),
  substituteDecline: (id: string, actorId: string, note: string) =>
    request<RequestDto>(`/api/requests/${id}/substitute/decline`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note }),
    }),
  returnRequest: (id: string, actorId: string, note: string) =>
    request<RequestDto>(`/api/requests/${id}/return`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note }),
    }),
  cancelRequest: (id: string, actorId: string, note?: string) =>
    request<RequestDto>(`/api/requests/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ actorId, note: note ?? null }),
    }),
  vacationBalance: (employeeId: string, year?: number) => {
    const qs = year ? `?year=${year}` : '';
    return request<VacationBalanceDto>(`/api/accounts/${employeeId}/vacation${qs}`);
  },
  leaveAllowances: (employeeId: string) =>
    request<LeaveAllowanceDto[]>(`/api/employees/${employeeId}/leave-allowances`),
  upsertLeaveAllowance: (employeeId: string, year: number, payload: UpsertLeaveAllowancePayload) =>
    request<LeaveAllowanceDto>(`/api/employees/${employeeId}/leave-allowances/${year}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  violations: (employeeId: string, from?: string, to?: string) => {
    const params = new URLSearchParams({ employeeId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request<ViolationDto[]>(`/api/violations?${params.toString()}`);
  },
};

export async function fetchHealth(): Promise<HealthResponse> {
  return api.health();
}
