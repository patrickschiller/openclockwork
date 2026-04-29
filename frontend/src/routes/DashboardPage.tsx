import { useEffect, useState } from 'react';
import { Alert, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { fetchHealth, type HealthResponse } from '../api/client';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: HealthResponse }
  | { kind: 'error'; message: string };

export function DashboardPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    fetchHealth()
      .then((data) => setState({ kind: 'ready', data }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
        setState({ kind: 'error', message });
      });
  }, []);

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">Dashboard</Typography>
        <Typography variant="body1" color="text.secondary">
          Übersicht über Konten, offene Anträge und Kernzeitverletzungen folgt mit AP 3.6.
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h4">Backend-Status</Typography>
            {state.kind === 'loading' && <CircularProgress aria-label="Lade Health-Status" />}
            {state.kind === 'ready' && (
              <Alert severity="success">
                {state.data.service} – {state.data.status} ({state.data.utcTimestamp})
              </Alert>
            )}
            {state.kind === 'error' && (
              <Alert severity="error">Backend nicht erreichbar: {state.message}</Alert>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
