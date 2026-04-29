import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
import { CheckCircleOutline, HighlightOff } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RequestStatus } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';
import { formatDateTime } from '../util/format';

const STATUSES: { value: RequestStatus | 'All'; label: string }[] = [
  { value: 'Submitted', label: 'Offen' },
  { value: 'Approved', label: 'Genehmigt' },
  { value: 'Rejected', label: 'Abgelehnt' },
  { value: 'All', label: 'Alle' }
];

export function AdminRequestsPage() {
  const { current, employees } = useCurrentEmployee();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'All'>('Submitted');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});

  const canDecide = current?.role === 'Manager' || current?.role === 'HRAdmin';

  const requestsQuery = useQuery({
    queryKey: ['requests', 'admin', statusFilter],
    queryFn: () =>
      api.listRequests(statusFilter === 'All' ? {} : { status: statusFilter }),
    enabled: canDecide
  });

  const employeeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, `${e.firstName} ${e.lastName} (${e.personalNo})`);
    return m;
  }, [employees]);

  const decideMutation = useMutation({
    mutationFn: async (args: { id: string; decision: 'approve' | 'reject' }) => {
      if (!current) throw new Error('Nicht angemeldet.');
      const note = decisionNote[args.id];
      return args.decision === 'approve'
        ? api.approveRequest(args.id, current.id, note)
        : api.rejectRequest(args.id, current.id, note);
    },
    onSuccess: (_, args) => {
      setFeedback({
        kind: 'success',
        text: args.decision === 'approve' ? 'Antrag genehmigt.' : 'Antrag abgelehnt.'
      });
      setDecisionNote((s) => {
        const { [args.id]: _ignored, ...rest } = s;
        return rest;
      });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (e: Error) => setFeedback({ kind: 'error', text: e.message })
  });

  if (!canDecide) {
    return (
      <Stack spacing={2}>
        <Typography variant="h1">Genehmigungen</Typography>
        <Alert severity="info">
          Diese Seite ist Vorgesetzten und HR-Admins vorbehalten. Wechsle oben das Profil zu Thomas Schmidt, Sabine
          Weber oder Anna Müller, um die Inbox zu sehen.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">Genehmigungen</Typography>
        <Typography variant="body1" color="text.secondary">
          Inbox eingegangener Anträge. Sondergenehmigungspflichtige (07–23 / Mitternacht) sind farblich hervorgehoben.
        </Typography>
      </Stack>

      {feedback && (
        <Alert severity={feedback.kind} onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      <Stack direction="row" spacing={2}>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RequestStatus | 'All')}
          sx={{ minWidth: 180 }}
        >
          {STATUSES.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Card>
        <CardContent>
          {requestsQuery.isLoading && <CircularProgress aria-label="Lade Anträge" />}
          {requestsQuery.data && requestsQuery.data.length === 0 && (
            <Typography color="text.secondary">Keine Anträge in diesem Filter.</Typography>
          )}
          {requestsQuery.data && requestsQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Antragsteller</TableCell>
                  <TableCell>Typ</TableCell>
                  <TableCell>Zeitraum</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Begründung</TableCell>
                  <TableCell>Notiz / Aktion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requestsQuery.data.map((r) => {
                  const isOpen = r.status === 'Submitted';
                  return (
                    <TableRow
                      key={r.id}
                      sx={{ bgcolor: r.requiresApproval ? 'warning.light' : undefined }}
                    >
                      <TableCell>{employeeMap.get(r.employeeId) ?? r.employeeId}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>
                        {formatDateTime(r.from)}
                        <br />
                        {formatDateTime(r.to)}
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <Chip
                            size="small"
                            label={r.status}
                            color={
                              r.status === 'Approved'
                                ? 'success'
                                : r.status === 'Rejected'
                                  ? 'error'
                                  : 'info'
                            }
                          />
                          {r.requiresApproval && <Chip size="small" color="warning" label="Sondergenehmigung" />}
                        </Stack>
                      </TableCell>
                      <TableCell>{r.reason ?? '—'}</TableCell>
                      <TableCell>
                        {isOpen ? (
                          <Stack spacing={1}>
                            <TextField
                              size="small"
                              placeholder="Notiz (optional)"
                              value={decisionNote[r.id] ?? ''}
                              onChange={(e) =>
                                setDecisionNote((s) => ({ ...s, [r.id]: e.target.value }))
                              }
                            />
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                startIcon={<CheckCircleOutline />}
                                disabled={decideMutation.isPending}
                                onClick={() => decideMutation.mutate({ id: r.id, decision: 'approve' })}
                              >
                                Genehmigen
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<HighlightOff />}
                                disabled={decideMutation.isPending}
                                onClick={() => decideMutation.mutate({ id: r.id, decision: 'reject' })}
                              >
                                Ablehnen
                              </Button>
                            </Box>
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {r.decisionNote ?? '—'}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
