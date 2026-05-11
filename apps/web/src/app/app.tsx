import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AppShell } from './AppShell';
import { LoginPage } from '../routes/LoginPage';
import { DashboardPage } from '../routes/DashboardPage';
import { BookingPage } from '../routes/BookingPage';
import { RequestsPage } from '../routes/RequestsPage';
import { CalendarPage } from '../routes/CalendarPage';
import { SubstitutePage } from '../routes/SubstitutePage';
import { AbsencesPage } from '../routes/AbsencesPage';
import { AdminRequestsPage } from '../routes/AdminRequestsPage';
import { AdminSchedulesPage } from '../routes/AdminSchedulesPage';
import { AdminEmployeesPage } from '../routes/AdminEmployeesPage';
import { PlaceholderPage } from '../routes/PlaceholderPage';

export function App() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="booking" element={<BookingPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="substitute" element={<SubstitutePage />} />
        <Route path="absences" element={<AbsencesPage />} />
        {/* Backwards-compat redirect from the old route name. */}
        <Route path="sickness" element={<Navigate to="/absences" replace />} />
        <Route path="admin/requests" element={<AdminRequestsPage />} />
        <Route path="admin/schedules" element={<AdminSchedulesPage />} />
        <Route path="admin/employees" element={<AdminEmployeesPage />} />
        <Route
          path="*"
          element={<PlaceholderPage title="Nicht gefunden" hint="Diese Seite existiert nicht." />}
        />
      </Route>
      <Route path="login" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
