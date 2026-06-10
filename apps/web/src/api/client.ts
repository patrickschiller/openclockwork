const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export type EmployeeRole = 'Employee' | 'Manager' | 'HRAdmin';
export type ThemePreference = 'Light' | 'Dark' | 'System';
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

export type Bundesland =
  | 'BW'
  | 'BY'
  | 'BE'
  | 'BB'
  | 'HB'
  | 'HH'
  | 'HE'
  | 'MV'
  | 'NI'
  | 'NW'
  | 'RP'
  | 'SL'
  | 'SN'
  | 'ST'
  | 'SH'
  | 'TH';

export const BUNDESLAND_LABEL: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

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
  startDate: string; // YYYY-MM-DD
  overtimeOpeningBalanceMinutes: number;
  bundesland: Bundesland;
  managerId: string | null;
  workScheduleId: string | null;
  workScheduleName: string | null;
  isActive: boolean;
}

export interface CreateEmployeePayload {
  personalNo: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: EmployeeRole;
  timeModel: TimeModel;
  weeklyHours: number;
  annualLeaveDays: number;
  startDate: string; // YYYY-MM-DD
  overtimeOpeningBalanceMinutes?: number;
  bundesland?: Bundesland;
  managerId: string | null;
  workScheduleId: string | null;
}

export interface UpdateEmployeePayload {
  personalNo?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: EmployeeRole;
  timeModel?: TimeModel;
  weeklyHours?: number;
  annualLeaveDays?: number;
  startDate?: string;
  overtimeOpeningBalanceMinutes?: number;
  bundesland?: Bundesland;
  managerId?: string | null;
  workScheduleId?: string | null;
  isActive?: boolean;
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
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  summary: TimeSummaryDto | null;
}

export interface SplitTimeEntryResult {
  first: TimeEntryDto;
  second: TimeEntryDto;
}

export interface ServiceOrderDto {
  id: string;
  projectId: string;
  orderNo: string;
  title: string;
  isActive: boolean;
}

export interface ProjectDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  serviceOrders: ServiceOrderDto[];
  assignedEmployeeCount: number;
  updatedAt: string;
}

/** Active project assigned to the current employee — booking selector entry. */
export interface BookableProjectDto {
  id: string;
  code: string;
  name: string;
}

export interface ProjectAssignmentDto {
  employeeId: string;
  projectId: string;
}

export interface UpsertProjectPayload {
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UpsertServiceOrderPayload {
  orderNo: string;
  title: string;
  isActive?: boolean;
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
  halfDayStart: boolean;
  halfDayEnd: boolean;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface AttachmentDto {
  id: string;
  requestId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
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

export interface BulkResult {
  id: string;
  ok: boolean;
  workflowState?: WorkflowState;
  status?: RequestStatus;
  error?: string;
}

export type ViolationKind = 'LateArrival' | 'EarlyDeparture' | 'MidDayGap';

export interface ViolationDto {
  employeeId: string;
  /** Day on which the violation occurred, YYYY-MM-DD. */
  date: string;
  kind: ViolationKind;
  /** Core-time window, formatted as "HH:mm–HH:mm". */
  boundary: string;
  /** Length of the uncovered gap, in minutes. */
  deltaMinutes: number;
  windowLabel?: string;
}

export type AbsenceKind = 'Sickness' | 'Training' | 'Flextime';

export interface AbsenceDto {
  id: string;
  employeeId: string;
  kind: AbsenceKind;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  certified: boolean;
  note: string | null;
  createdAt: string;
}

export interface CreateAbsencePayload {
  employeeId: string;
  kind?: AbsenceKind;
  from: string;
  to: string;
  certified?: boolean;
  note?: string | null;
}

export interface UpdateAbsencePayload {
  from?: string;
  to?: string;
  certified?: boolean;
  note?: string | null;
}

export interface CoreTimeWindowDto {
  id: string;
  label: string | null;
  start: string;
  end: string;
  weekdays: number;
}

export interface WorkScheduleDto {
  id: string;
  name: string;
  description: string | null;
  frameStart: string;
  frameEnd: string;
  isDefault: boolean;
  workingDays: number;
  coreTimes: CoreTimeWindowDto[];
  employeeCount: number;
  updatedAt: string;
}

export interface UpsertWorkSchedulePayload {
  name: string;
  description: string | null;
  frameStart: string;
  frameEnd: string;
  isDefault: boolean;
  workingDays: number;
  coreTimes: Array<{ label: string | null; start: string; end: string; weekdays: number }>;
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
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
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
  projectId: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface EmployeeProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: EmployeeRole;
  themePreference: ThemePreference;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  employee: EmployeeProfile;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const TOKEN_STORAGE_KEY = 'openclockwork.accessToken';
export const REFRESH_STORAGE_KEY = 'openclockwork.refreshToken';

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readToken(): string | null {
  return safeLocalStorage()?.getItem(TOKEN_STORAGE_KEY) ?? null;
}

function readRefreshToken(): string | null {
  return safeLocalStorage()?.getItem(REFRESH_STORAGE_KEY) ?? null;
}

function storeTokens(access: string | null, refresh: string | null): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  if (access) ls.setItem(TOKEN_STORAGE_KEY, access);
  else ls.removeItem(TOKEN_STORAGE_KEY);
  if (refresh) ls.setItem(REFRESH_STORAGE_KEY, refresh);
  else ls.removeItem(REFRESH_STORAGE_KEY);
}

/**
 * Coalesce concurrent refreshes: every 401 that lands while a refresh is
 * already in flight reuses the same promise instead of firing a parallel
 * /auth/refresh.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function tryRefreshOnce(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Refresh itself failed — clear the slate so the user is forced to log in.
        storeTokens(null, null);
        return null;
      }
      const body = (await res.json()) as RefreshResponse;
      storeTokens(body.accessToken, body.refreshToken);
      return body.accessToken;
    } catch {
      storeTokens(null, null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function attempt(path: string, init: RequestInit | undefined, token: string | null): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    // FormData sets its own multipart boundary — don't fight it.
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await attempt(path, init, readToken());

  // 401 → try to refresh once, then retry the original request.
  // /auth/refresh and /auth/login are excluded — they can't refresh themselves.
  if (
    response.status === 401 &&
    !path.startsWith('/api/auth/refresh') &&
    !path.startsWith('/api/auth/login')
  ) {
    const fresh = await tryRefreshOnce();
    if (fresh) response = await attempt(path, init, fresh);
  }

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
  me: () => request<EmployeeProfile>('/api/auth/me'),
  updatePreferences: (themePreference: ThemePreference) =>
    request<EmployeeProfile>('/api/auth/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ themePreference }),
    }),
  employees: (includeInactive = false) =>
    request<EmployeeDto[]>(`/api/employees${includeInactive ? '?includeInactive=true' : ''}`),
  createEmployee: (payload: CreateEmployeePayload) =>
    request<EmployeeDto>('/api/employees', { method: 'POST', body: JSON.stringify(payload) }),
  updateEmployee: (id: string, payload: UpdateEmployeePayload) =>
    request<EmployeeDto>(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  setEmployeePassword: (id: string, password: string) =>
    request<void>(`/api/employees/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  deactivateEmployee: (id: string) =>
    request<EmployeeDto>(`/api/employees/${id}`, { method: 'DELETE' }),
  reactivateEmployee: (id: string) =>
    request<EmployeeDto>(`/api/employees/${id}/reactivate`, { method: 'POST' }),
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
  updateTimeEntryProject: (id: string, projectId: string | null) =>
    request<TimeEntryDto>(`/api/timeentries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ projectId }),
    }),
  splitTimeEntry: (id: string, at: string, projectId?: string | null) =>
    request<SplitTimeEntryResult>(`/api/timeentries/${id}/split`, {
      method: 'POST',
      body: JSON.stringify(projectId === undefined ? { at } : { at, projectId }),
    }),
  projects: (includeInactive = false) =>
    request<ProjectDto[]>(`/api/projects${includeInactive ? '?includeInactive=true' : ''}`),
  bookableProjects: (employeeId: string) =>
    request<BookableProjectDto[]>(`/api/projects/bookable?employeeId=${employeeId}`),
  projectAssignments: () => request<ProjectAssignmentDto[]>('/api/projects/assignments'),
  createProject: (payload: UpsertProjectPayload) =>
    request<ProjectDto>('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
  updateProject: (id: string, payload: UpsertProjectPayload) =>
    request<ProjectDto>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  createServiceOrder: (projectId: string, payload: UpsertServiceOrderPayload) =>
    request<ServiceOrderDto>(`/api/projects/${projectId}/service-orders`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateServiceOrder: (projectId: string, orderId: string, payload: UpsertServiceOrderPayload) =>
    request<ServiceOrderDto>(`/api/projects/${projectId}/service-orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteServiceOrder: (projectId: string, orderId: string) =>
    request<void>(`/api/projects/${projectId}/service-orders/${orderId}`, { method: 'DELETE' }),
  assignProject: (projectId: string, employeeId: string) =>
    request<void>(`/api/projects/${projectId}/assignments/${employeeId}`, { method: 'PUT' }),
  unassignProject: (projectId: string, employeeId: string) =>
    request<void>(`/api/projects/${projectId}/assignments/${employeeId}`, { method: 'DELETE' }),
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
  bulkApproveRequests: (
    actorId: string,
    ids: string[],
    note?: string,
    requiresHrConfirmation = false,
  ) =>
    request<BulkResult[]>('/api/requests/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ actorId, ids, note: note ?? null, requiresHrConfirmation }),
    }),
  bulkRejectRequests: (actorId: string, ids: string[], note: string) =>
    request<BulkResult[]>('/api/requests/bulk-reject', {
      method: 'POST',
      body: JSON.stringify({ actorId, ids, note }),
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
  absences: (filters: { employeeId?: string; from?: string; to?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    const qs = params.toString();
    return request<AbsenceDto[]>(`/api/absences${qs ? `?${qs}` : ''}`);
  },
  createAbsence: (payload: CreateAbsencePayload) =>
    request<AbsenceDto>('/api/absences', { method: 'POST', body: JSON.stringify(payload) }),
  updateAbsence: (id: string, payload: UpdateAbsencePayload) =>
    request<AbsenceDto>(`/api/absences/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAbsence: (id: string) =>
    request<void>(`/api/absences/${id}`, { method: 'DELETE' }),
  workSchedules: () => request<WorkScheduleDto[]>('/api/work-schedules'),
  workSchedule: (id: string) => request<WorkScheduleDto>(`/api/work-schedules/${id}`),
  createWorkSchedule: (payload: UpsertWorkSchedulePayload) =>
    request<WorkScheduleDto>('/api/work-schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateWorkSchedule: (id: string, payload: UpsertWorkSchedulePayload) =>
    request<WorkScheduleDto>(`/api/work-schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteWorkSchedule: (id: string) =>
    request<void>(`/api/work-schedules/${id}`, { method: 'DELETE' }),
  assignSchedule: (id: string, employeeId: string) =>
    request<void>(`/api/work-schedules/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ employeeId }),
    }),
  bulkAssignSchedule: (id: string, timeModel: TimeModel, overrideExisting: boolean) =>
    request<{ scheduleId: string; assigned: number; skipped: number }>(
      `/api/work-schedules/${id}/bulk-assign`,
      {
        method: 'POST',
        body: JSON.stringify({ timeModel, overrideExisting }),
      },
    ),

  listAttachments: (requestId: string) =>
    request<AttachmentDto[]>(`/api/requests/${requestId}/attachments`),
  uploadAttachment: (requestId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return request<AttachmentDto>(`/api/requests/${requestId}/attachments`, {
      method: 'POST',
      body: fd,
    });
  },
  deleteAttachment: (attachmentId: string) =>
    request<void>(`/api/attachments/${attachmentId}`, { method: 'DELETE' }),
  /**
   * Downloads the attachment as a Blob and triggers a browser save dialog.
   * Returns nothing — the side effect is the save. Uses `request`'s auth
   * + refresh handling implicitly by going through a custom raw fetch path
   * because we need binary, not JSON.
   */
  downloadAttachment: async (attachmentId: string, fileName: string): Promise<void> => {
    const token = readToken();
    const fetchOnce = async (t: string | null) =>
      fetch(`${baseUrl}/api/attachments/${attachmentId}`, {
        headers: t ? { Authorization: `Bearer ${t}` } : undefined,
      });
    let res = await fetchOnce(token);
    if (res.status === 401) {
      const fresh = await tryRefreshOnce();
      if (fresh) res = await fetchOnce(fresh);
    }
    if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export async function fetchHealth(): Promise<HealthResponse> {
  return api.health();
}
