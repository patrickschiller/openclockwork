import { Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { DashboardPage } from '../routes/DashboardPage';
import { PlaceholderPage } from '../routes/PlaceholderPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route
          path="booking"
          element={
            <PlaceholderPage
              title="Buchen"
              hint="Kommen / Gehen mit GPS — kommt in Epic 2."
            />
          }
        />
        <Route
          path="calendar"
          element={
            <PlaceholderPage
              title="Kalender"
              hint="Jahreskalender mit Krankheit, Urlaub, Home-Office — kommt in Epic 3."
            />
          }
        />
        <Route
          path="requests"
          element={
            <PlaceholderPage
              title="Anträge"
              hint="Urlaub, Home-Office, Sonderurlaub, Zeitanträge — kommt in Epic 3."
            />
          }
        />
        <Route
          path="substitute"
          element={
            <PlaceholderPage
              title="Vertretungen"
              hint="Vertretungs-Inbox für eingehende Urlaubsanträge — kommt in Epic 4."
            />
          }
        />
        <Route
          path="admin/requests"
          element={
            <PlaceholderPage
              title="Genehmigungen"
              hint="Manager- und HR-Genehmigungs-Queue — kommt in Epic 4."
            />
          }
        />
        <Route
          path="*"
          element={
            <PlaceholderPage
              title="Nicht gefunden"
              hint="Diese Seite existiert nicht."
            />
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
