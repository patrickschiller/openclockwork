import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { soloApi, type SoloProject } from '../../api/solo';
import { useI18n } from '../../app/i18n';
import { dateInZone, localCandidates } from '../../app/solo-time';
import { Feedback, Field, Minutes, QueryError, useSoloAction } from './SoloUi';
import { AllocationFields } from './SoloTimesPage';

export function DailyBlockDialog({
  projects,
  timeZone,
  close,
}: {
  projects: SoloProject[];
  timeZone: string;
  close: () => void;
}) {
  const { t } = useI18n();
  const action = useSoloAction();
  const [date, setDate] = useState(dateInZone(timeZone));
  const [start, setStart] = useState('08:00');
  const [allocation, setAllocation] = useState({
    projectId: '',
    serviceOrderId: '',
    activity: '',
    note: '',
    billable: false,
  });
  const option = useQuery({
    queryKey: ['solo-daily-block-option', date],
    queryFn: () => soloApi.dailyBlockOption(date),
    enabled: Boolean(date),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('solo.dailyBlockAction')}</DialogTitle>
          <DialogDescription>{t('solo.dailyBlockHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(() => {
              const candidates = localCandidates(`${date}T${start}`, timeZone);
              if (candidates.length !== 1)
                throw new Error(
                  t(
                    candidates.length
                      ? 'solo.ambiguousTime'
                      : 'solo.invalidTime',
                  ),
                );
              return soloApi.dailyBlock({
                date,
                start,
                ...allocation,
                projectId: allocation.projectId || null,
                serviceOrderId: allocation.serviceOrderId || null,
                activity: allocation.activity.trim() || null,
                note: allocation.note.trim() || null,
              });
            }, close);
          }}
        >
          <Feedback action={action} />
          <QueryError error={option.error} retry={option.refetch} />
          <Field label={t('projects.reportDate')}>
            <Input
              type="date"
              required
              max={dateInZone(timeZone)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label={`${t('schedules.start')} · ${timeZone}`}>
            <Input
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          {option.data && (
            <p className="text-sm">
              {t('solo.gross')}: <Minutes value={option.data.grossMinutes} /> ·{' '}
              {t('solo.break')}: <Minutes value={option.data.breakMinutes} /> ·{' '}
              {t('solo.net')}: <Minutes value={option.data.dailyNetMinutes} />
            </p>
          )}
          <AllocationFields
            value={allocation}
            onChange={setAllocation}
            projects={projects}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={
                !option.data?.enabled ||
                option.isFetching ||
                action.pending ||
                !action.online
              }
            >
              {t('solo.dailyBlockAction')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
