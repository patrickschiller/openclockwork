import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';

const projectsMock = vi.fn();
const employeesMock = vi.fn();
const projectAssignmentsMock = vi.fn();
const createProjectMock = vi.fn();
const updateProjectMock = vi.fn();
const deleteProjectMock = vi.fn();
const createServiceOrderMock = vi.fn();
const updateServiceOrderMock = vi.fn();
const deleteServiceOrderMock = vi.fn();
const assignProjectMock = vi.fn();
const unassignProjectMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    projects: (...args: unknown[]) => projectsMock(...args),
    employees: (...args: unknown[]) => employeesMock(...args),
    projectAssignments: (...args: unknown[]) => projectAssignmentsMock(...args),
    createProject: (...args: unknown[]) => createProjectMock(...args),
    updateProject: (...args: unknown[]) => updateProjectMock(...args),
    deleteProject: (...args: unknown[]) => deleteProjectMock(...args),
    createServiceOrder: (...args: unknown[]) => createServiceOrderMock(...args),
    updateServiceOrder: (...args: unknown[]) => updateServiceOrderMock(...args),
    deleteServiceOrder: (...args: unknown[]) => deleteServiceOrderMock(...args),
    assignProject: (...args: unknown[]) => assignProjectMock(...args),
    unassignProject: (...args: unknown[]) => unassignProjectMock(...args),
  },
}));

let role = 'HRAdmin';
vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({
    id: 'u-1',
    email: 'a@test',
    firstName: 'Admin',
    lastName: 'User',
    role,
  }),
  useAuth: () => ({ user: null, login: vi.fn(), logout: vi.fn(), loading: false }),
}));

const PROJECTS = [
  {
    id: 'p-1',
    code: 'PRJ-001',
    name: 'Website Relaunch',
    description: 'Relaunch inkl. CMS.',
    isActive: true,
    serviceOrders: [
      { id: 'so-1', projectId: 'p-1', orderNo: 'SA-001', title: 'Konzeption', isActive: true },
    ],
    assignedEmployeeCount: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p-2',
    code: 'PRJ-002',
    name: 'ERP-Einführung',
    description: null,
    isActive: true,
    serviceOrders: [],
    assignedEmployeeCount: 0,
    updatedAt: new Date().toISOString(),
  },
];

const EMPLOYEES = [
  {
    id: 'e-1',
    personalNo: '1001',
    firstName: 'Anna',
    lastName: 'Müller',
    role: 'Employee',
    isActive: true,
  },
  {
    id: 'e-2',
    personalNo: '1002',
    firstName: 'Bernd',
    lastName: 'Schulz',
    role: 'Employee',
    isActive: true,
  },
];

describe('AdminProjectsPage', () => {
  beforeEach(() => {
    role = 'HRAdmin';
    projectsMock.mockClear().mockResolvedValue(PROJECTS);
    employeesMock.mockClear().mockResolvedValue(EMPLOYEES);
    projectAssignmentsMock
      .mockClear()
      .mockResolvedValue([{ employeeId: 'e-1', projectId: 'p-1' }]);
    createProjectMock.mockClear().mockResolvedValue(PROJECTS[0]);
    assignProjectMock.mockClear().mockResolvedValue(undefined);
    unassignProjectMock.mockClear().mockResolvedValue(undefined);
  });

  it('blocks plain employees with an alert and loads nothing', async () => {
    role = 'Employee';
    const { AdminProjectsPage } = await import('./AdminProjectsPage');
    renderWithProviders(<AdminProjectsPage />);
    expect(screen.getByText(/Managern und HR-Admins vorbehalten/i)).toBeDefined();
    expect(projectsMock).not.toHaveBeenCalled();
  });

  it('is accessible for Managers too', async () => {
    role = 'Manager';
    const { AdminProjectsPage } = await import('./AdminProjectsPage');
    renderWithProviders(<AdminProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('Website Relaunch')).toBeDefined();
    });
  });

  it('renders project cards with their service orders', async () => {
    const { AdminProjectsPage } = await import('./AdminProjectsPage');
    renderWithProviders(<AdminProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('Website Relaunch')).toBeDefined();
    });
    // Project codes appear in the card title AND the matrix column header.
    expect(screen.getAllByText('PRJ-002').length).toBeGreaterThan(0);
    expect(screen.getByText('SA-001')).toBeDefined();
    expect(screen.getByText('Konzeption')).toBeDefined();
  });

  it('creates a project through the dialog', async () => {
    const { AdminProjectsPage } = await import('./AdminProjectsPage');
    renderWithProviders(<AdminProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('Website Relaunch')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Neues Projekt/i }));
    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: 'PRJ-003' },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Drittes Projekt' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Speichern$/ }));

    await waitFor(() => {
      expect(createProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'PRJ-003', name: 'Drittes Projekt', isActive: true }),
      );
    });
  });

  it('renders the assignment matrix and toggles assignments', async () => {
    const { AdminProjectsPage } = await import('./AdminProjectsPage');
    renderWithProviders(<AdminProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('Zuweisungsmatrix')).toBeDefined();
    });

    const annaP1 = await screen.findByLabelText('Anna Müller – PRJ-001');
    const berndP2 = screen.getByLabelText('Bernd Schulz – PRJ-002');
    expect((annaP1 as HTMLInputElement).checked).toBe(true);
    expect((berndP2 as HTMLInputElement).checked).toBe(false);

    // Unchecking an assigned cell unassigns; checking an empty one assigns.
    fireEvent.click(annaP1);
    await waitFor(() => {
      expect(unassignProjectMock).toHaveBeenCalledWith('p-1', 'e-1');
    });
    fireEvent.click(berndP2);
    await waitFor(() => {
      expect(assignProjectMock).toHaveBeenCalledWith('p-2', 'e-2');
    });
  });
});
