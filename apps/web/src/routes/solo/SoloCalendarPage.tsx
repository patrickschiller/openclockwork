import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { soloApi, type PersonalDay } from '../../api/solo';
import { useInstallation } from '../../app/installation';
import { useI18n } from '../../app/i18n';
import { dateInZone } from '../../app/solo-time';
import {
  Check,
  Feedback,
  Field,
  QueryError,
  SoloConfirmDialog,
  selectClass,
  textareaClass,
  useSoloAction,
} from './SoloUi';
import { AuditDialog } from './SoloTimesPage';
import { PersonalHints } from './PersonalHints';
import { SoloMonthCalendar } from './SoloMonthCalendar';

export function SoloCalendarPage() {
  const { t, languageTag } = useI18n();
  const installation = useInstallation();
  const days = useQuery({ queryKey: ['solo-days'], queryFn: soloApi.days });
  const [editing, setEditing] = useState<{ day: PersonalDay | null } | null>(
    null,
  );
  const [history, setHistory] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState<PersonalDay | null>(null);
  const format = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(languageTag, {
      timeZone: 'UTC',
    });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{t('nav.calendar')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('solo.calendarHint')}
          </p>
        </div>
        <Button onClick={() => setEditing({ day: null })}>
          {t('solo.dayNew')}
        </Button>
      </div>
      <SoloMonthCalendar
        days={days.data ?? []}
        timeZone={installation.data?.timeZone ?? 'UTC'}
      />
      <PersonalHints />
      <QueryError error={days.error} retry={days.refetch} />
      <p className="text-sm text-muted-foreground">
        {t('solo.calendarPrivacy')}
      </p>
      <Check
        label={t('solo.showVoided')}
        checked={cancelled}
        onChange={setCancelled}
      />
      {days.isLoading && <p>{t('common.loading')}</p>}
      <div className="space-y-3">
        {days.data
          ?.filter((day) => cancelled || !day.cancelledAt)
          .sort((a, b) => b.from.localeCompare(a.from))
          .map((day) => (
            <Card key={day.id} className={day.cancelledAt ? 'opacity-60' : ''}>
              <CardContent className="space-y-3 pt-5">
                <h2 className="font-semibold">
                  {t(`solo.day.${day.kind}`)} · {format(day.from)} –{' '}
                  {format(day.to)}
                </h2>
                {(day.halfDayStart || day.halfDayEnd) && (
                  <p className="text-xs text-muted-foreground">
                    {[
                      day.halfDayStart ? t('requests.firstHalfDay') : '',
                      day.halfDayEnd ? t('requests.lastHalfDay') : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {day.note && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {day.note}
                  </p>
                )}
                {day.cancelledAt && (
                  <p className="text-sm">{t('solo.voided')}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!day.cancelledAt && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing({ day })}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCancelling(day)}
                      >
                        {t('solo.void')}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistory(day.id)}
                  >
                    {t('solo.history')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
      {days.data?.length === 0 && <p>{t('solo.noDays')}</p>}
      {editing && (
        <DayEditor
          day={editing.day}
          timeZone={installation.data?.timeZone ?? 'UTC'}
          close={() => setEditing(null)}
        />
      )}
      {history && (
        <AuditDialog id={history} day close={() => setHistory(null)} />
      )}
      {cancelling && (
        <SoloConfirmDialog
          title={t('solo.cancelDay')}
          description={t('solo.cancelDayHint')}
          target={`${t(`solo.day.${cancelling.kind}`)} · ${format(cancelling.from)} – ${format(cancelling.to)}`}
          onConfirm={() =>
            soloApi.cancelDay(cancelling.id, cancelling.revision)
          }
          close={() => setCancelling(null)}
        />
      )}
    </div>
  );
}
function DayEditor({
  day,
  timeZone,
  close,
}: {
  day: PersonalDay | null;
  timeZone: string;
  close: () => void;
}) {
  const { t } = useI18n();
  const action = useSoloAction();
  const [draft, setDraft] = useState({
    kind: day?.kind ?? 'Free',
    from: day?.from ?? dateInZone(timeZone),
    to: day?.to ?? dateInZone(timeZone),
    note: day?.note ?? '',
    halfDayStart: day?.halfDayStart ?? false,
    halfDayEnd: day?.halfDayEnd ?? false,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(day ? 'solo.dayEdit' : 'solo.dayNew')}</DialogTitle>
          <DialogDescription>{t('solo.calendarPrivacy')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              () =>
                soloApi.saveDay(day?.id ?? null, {
                  ...draft,
                  note: draft.note.trim() || null,
                  ...(day ? { revision: day.revision } : {}),
                }),
              close,
            );
          }}
        >
          <Feedback action={action} />
          <Field label={t('common.type')}>
            <select
              className={selectClass}
              value={draft.kind}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  kind: e.target.value as PersonalDay['kind'],
                })
              }
            >
              {(['Free', 'Vacation', 'Sickness', 'Training'] as const).map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {t(`solo.day.${kind}`)}
                  </option>
                ),
              )}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.from')}>
              <Input
                type="date"
                required
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </Field>
            <Field label={t('common.to')}>
              <Input
                type="date"
                required
                min={draft.from}
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </Field>
          </div>
          <Check
            label={t('requests.firstHalfDay')}
            checked={draft.halfDayStart}
            onChange={(v) => setDraft({ ...draft, halfDayStart: v })}
          />
          <Check
            label={t('requests.lastHalfDay')}
            checked={draft.halfDayEnd}
            onChange={(v) => setDraft({ ...draft, halfDayEnd: v })}
          />
          <Field label={t('solo.privateNote')}>
            <textarea
              className={textareaClass}
              maxLength={2000}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button disabled={action.pending || !action.online}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
