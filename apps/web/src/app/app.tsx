import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { LoginPage } from '../routes/LoginPage';
import { useI18n } from './i18n';

// AppShell + the realtime hook + lucide icons are deferred until the
// user is authenticated. An unauthenticated visit to / only loads
// LoginPage + this router.
const AppShell = lazy(() =>
  import('./AppShell').then((m) => ({ default: m.AppShell })),
);
const KioskPage = lazy(() =>
  import('../routes/KioskPage').then((m) => ({ default: m.KioskPage })),
);

// Route-based code-splitting: each page becomes its own Vite chunk so
// the initial bundle only carries the AppShell + Login + the lazy
// loader stub. The service worker prefetches the rest after first paint.
const DashboardPage = lazy(() =>
  import('../routes/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const BookingPage = lazy(() =>
  import('../routes/BookingPage').then((m) => ({ default: m.BookingPage })),
);
const CalendarPage = lazy(() =>
  import('../routes/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const RequestsPage = lazy(() =>
  import('../routes/RequestsPage').then((m) => ({ default: m.RequestsPage })),
);
const SubstitutePage = lazy(() =>
  import('../routes/SubstitutePage').then((m) => ({
    default: m.SubstitutePage,
  })),
);
const AbsencesPage = lazy(() =>
  import('../routes/AbsencesPage').then((m) => ({ default: m.AbsencesPage })),
);
const AdminRequestsPage = lazy(() =>
  import('../routes/AdminRequestsPage').then((m) => ({
    default: m.AdminRequestsPage,
  })),
);
const AdminSchedulesPage = lazy(() =>
  import('../routes/AdminSchedulesPage').then((m) => ({
    default: m.AdminSchedulesPage,
  })),
);
const AdminProjectsPage = lazy(() =>
  import('../routes/AdminProjectsPage').then((m) => ({
    default: m.AdminProjectsPage,
  })),
);
const AdminEmployeesPage = lazy(() =>
  import('../routes/AdminEmployeesPage').then((m) => ({
    default: m.AdminEmployeesPage,
  })),
);
const AdminWorkingTimesPage = lazy(() =>
  import('../routes/AdminWorkingTimesPage').then((m) => ({
    default: m.AdminWorkingTimesPage,
  })),
);
const AdminTerminalsPage = lazy(() =>
  import('../routes/AdminTerminalsPage').then((m) => ({
    default: m.AdminTerminalsPage,
  })),
);
const TerminalScanPage = lazy(() =>
  import('../routes/TerminalScanPage').then((m) => ({
    default: m.TerminalScanPage,
  })),
);
const PlaceholderPage = lazy(() =>
  import('../routes/PlaceholderPage').then((m) => ({
    default: m.PlaceholderPage,
  })),
);

function RouteFallback() {
  const { t } = useI18n();
  return (
    <div
      className="flex h-64 items-center justify-center text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      {t('common.loading')}
    </div>
  );
}

export function App() {
  const { user } = useAuth();
  const { t } = useI18n();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* A paired kiosk is a device, not an employee. It must remain
            reachable before the global employee-login gate. */}
        <Route path="kiosk" element={<KioskPage />} />
        {!user ? (
          <Route path="*" element={<LoginPage />} />
        ) : (
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="booking" element={<BookingPage />} />
            <Route path="terminal" element={<TerminalScanPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="substitute" element={<SubstitutePage />} />
            <Route path="absences" element={<AbsencesPage />} />
            {/* Backwards-compat redirect from the old route name. */}
            <Route
              path="sickness"
              element={<Navigate to="/absences" replace />}
            />
            <Route path="admin/requests" element={<AdminRequestsPage />} />
            <Route path="admin/projects" element={<AdminProjectsPage />} />
            <Route
              path="admin/working-times"
              element={<AdminWorkingTimesPage />}
            />
            <Route path="admin/schedules" element={<AdminSchedulesPage />} />
            <Route path="admin/employees" element={<AdminEmployeesPage />} />
            <Route
              path="admin/settings/terminals"
              element={<AdminTerminalsPage />}
            />
            <Route
              path="*"
              element={
                <PlaceholderPage
                  title={t('app.notFound')}
                  hint={t('app.notFoundHint')}
                />
              }
            />
          </Route>
        )}
        {user && <Route path="login" element={<Navigate to="/" replace />} />}
      </Routes>
    </Suspense>
  );
}

export default App;
