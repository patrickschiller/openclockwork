import { useEffect, useState } from 'react';
import { AppBar, Box, Container, Toolbar, Typography, Alert, CircularProgress, Stack } from '@mui/material';
import { fetchHealth, type HealthResponse } from './api/client';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: HealthResponse }
  | { kind: 'error'; message: string };

export function App() {
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
    <Box>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" component="h1">
            BagChronos
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Stack spacing={2}>
          <Typography variant="body1">
            Initiale Smoke-Page. Sobald das Backend erreichbar ist, wird hier der Health-Status angezeigt.
          </Typography>
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
      </Container>
    </Box>
  );
}
