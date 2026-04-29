import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { AddOutlined } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RequestType } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';
import { formatDateTime, isOutsideRegularHours } from '../util/format';

const REQUEST_TYPES: { value: RequestType; label: string; description: string }[] = [
  { value: 'Vacation', label: 'Urlaub', description: 'Mehrere Tage – ganztägig.' },
  { value: 'HomeOffice', label: 'Home-Office', description: 'Tag(e) im Home-Office.' },
  { value: 'SpecialLeave', label: 'Sonderurlaub', description: 'Hochzeit, Umzug, Trauerfall…' },
  { value: 'TimeCorrection', label: 'Zeitkorrektur', description: 'Manuelle Buchungskorrektur.' }
];

const STATUS_TONE: Record<string, 'default' | 'success' | 'error' | 'info'> = {
  Submitted: 'info',
  Approved: 'success',
  Rejected: 'error'
};

function emptyForm(): { type: RequestType; from: string; to: string; reason: string } {
  const today = new Date().toISOString().slice(0, 10);
  return { type: 'Vacation', from: `${today}T09:00`, to: `${today}T17:00`, reason: '' };
}

export function RequestsPage() {
  const { current } = useCurrentEmployee();
  const employeeId = current?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const requestsQuery = useQuery({
    queryKey: ['requests', 'mine', employeeId],
    queryFn: () => api.listRequests({ employeeId }),
    enabled: !!employeeId
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!employeeId) throw new Error('Kein Mitarbeiter ausgewählt.');
      return api.createRequest({
        employeeId,
        type: form.type,
        from: new Date(form.from).toISOString(),
        to: new Date(form.to).toISOString(),
        reason: form.reason || null
      });
    },
    onSuccess: () => {
      setFeedback({ kind: 'success', text: 'Antrag eingereicht.' });
      setDialogOpen(false);
      setForm(emptyForm());
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  const showSpecialApprovalWarning = useMemo(() => {
    if (form.type !== 'TimeCorrection') return false;
    if (!form.from || !form.to) return false;
    return (
      isOutsideRegularHours(new Date(form.from).toISOString()) ||
      isOutsideRegularHours(new Date(form.to).toISOString())
    );
  }, [form]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Stack spacing={1}>
          <Typography variant="h1">Anträge</Typography>
          <Typography variant="body1" color="text.secondary">
            Urlaub, Home-Office, Sonderurlaub und Zeitkorrekturen.
          </Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setDialogOpen(true)}>
          Neuer Antrag
        </Button>
      </Stack>

      {feedback && (
        <Alert severity={feedback.kind} onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h4">Meine Anträge</Typography>
            {requestsQuery.isLoading && <CircularProgress aria-label="Lade Anträge" />}
            {requestsQuery.data && requestsQuery.data.length === 0 && (
              <Typography color="text.secondary">Noch keine Anträge gestellt.</Typography>
            )}
            {requestsQuery.data && requestsQuery.data.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Typ</TableCell>
                    <TableCell>Von</TableCell>
                    <TableCell>Bis</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Begründung</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requestsQuery.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>{formatDateTime(r.from)}</TableCell>
                      <TableCell>{formatDateTime(r.to)}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          <Chip size="small" label={r.status} color={STATUS_TONE[r.status] ?? 'default'} />
                          {r.requiresApproval && <Chip size="small" color="warning" label="Sondergenehmigung" />}
                        </Stack>
                      </TableCell>
                      <TableCell>{r.reason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Neuer Antrag</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Typ"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as RequestType })}
              helperText={REQUEST_TYPES.find((t) => t.value === form.type)?.description}
            >
              {REQUEST_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="datetime-local"
              label="Von"
              InputLabelProps={{ shrink: true }}
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
            <TextField
              type="datetime-local"
              label="Bis"
              InputLabelProps={{ shrink: true }}
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
            <TextField
              label="Begründung (optional)"
              multiline
              minRows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            {showSpecialApprovalWarning && (
              <Alert severity="warning">
                Diese Zeitkorrektur fällt vor 07:00 oder nach 23:00 und ist sondergenehmigungspflichtig.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Abbrechen</Button>
          <Button
            variant="contained"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Sende…' : 'Einreichen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
