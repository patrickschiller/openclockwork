import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BUNDESLAND_LABEL } from '../../api/client';
import { soloApi, type Installation, type SoloPolicy } from '../../api/solo';
import { useAuth, useCurrentUser } from '../../app/auth';
import { useInstallation } from '../../app/installation';
import { useI18n } from '../../app/i18n';
import { dateInZone } from '../../app/solo-time';
import { AuditDialog } from './SoloTimesPage';
import {
  Check,
  Feedback,
  Field,
  QueryError,
  selectClass,
  textareaClass,
  useSoloAction,
} from './SoloUi';

export function SoloSettingsPage() {
  const { t } = useI18n();
  const installation = useInstallation();
  const [history, setHistory] = useState(false);
  if (!installation.data)
    return (
      <QueryError error={installation.error} retry={installation.refetch} />
    );
  const solo = installation.data.mode === 'Solo';
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">
        {t(
          solo && !installation.data.setupCompleted
            ? 'solo.setup'
            : 'solo.settings',
        )}
      </h1>
      {solo && !installation.data.setupCompleted && (
        <p>{t('solo.setupHint')}</p>
      )}
      <ProfileEditor installation={installation.data} />
      {(installation.data.futurePolicies?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('solo.futurePolicies')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {installation.data.futurePolicies?.map((policy) => (
                <li className="text-sm" key={policy.id}>
                  {t('solo.effectiveFrom')}:{' '}
                  <strong>{policy.effectiveFrom}</strong> · {t('solo.target')}:{' '}
                  {policy.targetEnabled
                    ? `${(policy.weeklyTargetMinutes ?? 0) / 60} h`
                    : t('common.inactive')}{' '}
                  · {t('solo.leave')}:{' '}
                  {t(policy.leaveEnabled ? 'common.yes' : 'common.no')}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {solo && (
        <PolicyEditor
          key={installation.data.revision}
          installation={installation.data}
        />
      )}
      <PasswordEditor />
      <ModeEditor installation={installation.data} />
      {solo && (
        <Button variant="outline" onClick={() => setHistory(true)}>
          {t('solo.history')}
        </Button>
      )}
      {history && (
        <AuditDialog
          id="installation"
          settings
          close={() => setHistory(false)}
        />
      )}
    </div>
  );
}
function ProfileEditor({ installation }: { installation: Installation }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { patchUser } = useAuth();
  const action = useSoloAction();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('solo.profile')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              () =>
                soloApi.profile({
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  email: email.trim(),
                }),
              (result) =>
                patchUser({
                  firstName: result.firstName,
                  lastName: result.lastName,
                  email: result.email,
                }),
            );
          }}
        >
          <Feedback action={action} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('employees.firstName')}>
              <Input
                required
                maxLength={100}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Field>
            <Field label={t('employees.lastName')}>
              <Input
                required
                maxLength={100}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </Field>
          </div>
          <Field label={t('common.email')}>
            <Input
              required
              type="email"
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button disabled={action.pending || !action.online}>
            {t('common.save')}
          </Button>
        </form>
        <p className="text-sm">
          {t('solo.timeZone')}: <strong>{installation.timeZone}</strong>
        </p>
        <p className="text-xs text-muted-foreground">
          {t('solo.timeZoneHint')}
        </p>
      </CardContent>
    </Card>
  );
}
function PolicyEditor({ installation }: { installation: Installation }) {
  const { t, languageTag } = useI18n();
  const navigate = useNavigate();
  const action = useSoloAction();
  const [policy, setPolicy] = useState<SoloPolicy>({
    ...installation.policy,
    frameStart: installation.policy.frameStart ?? '00:00',
    frameEnd: installation.policy.frameEnd ?? '23:59',
    coreTimes: installation.policy.coreTimes ?? [],
    carryOverDays: installation.policy.carryOverDays ?? 0,
    carryOverExpiresOn: installation.policy.carryOverExpiresOn ?? null,
    leaveAdjustmentDays: installation.policy.leaveAdjustmentDays ?? 0,
    leaveAdjustmentReason: installation.policy.leaveAdjustmentReason ?? null,
    leaveAllowanceYear:
      installation.policy.leaveAllowanceYear ??
      Number(dateInZone(installation.timeZone).slice(0, 4)),
    effectiveFrom: dateInZone(installation.timeZone),
    breakRules: installation.policy.breakRules.map((rule) => ({ ...rule })),
  });
  const [holidays, setHolidays] = useState(policy.holidayDates.join('\n'));
  const [confirmZone, setConfirmZone] = useState(false);
  const [revision, setRevision] = useState(installation.revision);
  const update = <K extends keyof SoloPolicy>(key: K, value: SoloPolicy[K]) =>
    setPolicy((current) => ({ ...current, [key]: value }));
  const save = async (complete: boolean) => {
    if (!policy.workingDays) throw new Error(t('solo.selectDay'));
    const dates = holidays.split(/[\s,;]+/).filter(Boolean);
    if (
      dates.some(
        (date) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date,
      )
    )
      throw new Error(t('employees.holidayDatesInvalid'));
    const { id: _id, ...values } = policy;
    const saved = await soloApi.settings({
      ...values,
      holidayDates: [...new Set(dates)],
      revision,
      weeklyTargetMinutes: policy.targetEnabled
        ? policy.weeklyTargetMinutes
        : null,
      dailyBlockEnabled: policy.targetEnabled && policy.dailyBlockEnabled,
    });
    // Setup completion is a second request. Preserve the confirmed revision
    // if that request fails, so retrying does not submit the old revision.
    setRevision(saved.revision);
    if (complete) await soloApi.completeSetup();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('solo.personalRules')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              () => save(!installation.setupCompleted),
              () => {
                if (!installation.setupCompleted) navigate('/');
              },
            );
          }}
        >
          <Feedback action={action} />
          <Field label={t('solo.effectiveFrom')} hint={t('solo.effectiveHint')}>
            <Input
              type="date"
              required
              value={policy.effectiveFrom}
              min={dateInZone(installation.timeZone)}
              onChange={(e) => update('effectiveFrom', e.target.value)}
            />
          </Field>
          <Check
            label={t('solo.targets')}
            checked={policy.targetEnabled}
            onChange={(enabled) =>
              setPolicy((current) => ({
                ...current,
                targetEnabled: enabled,
                weeklyTargetMinutes: enabled
                  ? (current.weeklyTargetMinutes ?? 2400)
                  : null,
                dailyBlockEnabled: enabled && current.dailyBlockEnabled,
              }))
            }
          />
          {policy.targetEnabled && (
            <Field label={t('solo.weeklyTarget')}>
              <Input
                type="number"
                required
                min="0.25"
                max="168"
                step="0.25"
                value={(policy.weeklyTargetMinutes ?? 0) / 60}
                onChange={(e) =>
                  update(
                    'weeklyTargetMinutes',
                    Math.round(Number(e.target.value) * 60),
                  )
                }
              />
            </Field>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {t('solo.workingDays')}
            </legend>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 7 }, (_, index) => (
                <Check
                  key={index}
                  label={new Date(
                    Date.UTC(2024, 0, 1 + index),
                  ).toLocaleDateString(languageTag, {
                    weekday: 'short',
                    timeZone: 'UTC',
                  })}
                  checked={Boolean(policy.workingDays & (1 << index))}
                  onChange={() =>
                    update('workingDays', policy.workingDays ^ (1 << index))
                  }
                />
              ))}
            </div>
          </fieldset>
          <Check
            label={t('solo.leave')}
            checked={policy.leaveEnabled}
            onChange={(value) => update('leaveEnabled', value)}
          />
          {policy.leaveEnabled && (
            <div className="space-y-3">
              <Field label={t('solo.leaveDays')}>
                <Input
                  type="number"
                  required
                  min="0"
                  max="366"
                  step="0.5"
                  value={policy.annualLeaveDays}
                  onChange={(e) =>
                    update('annualLeaveDays', Number(e.target.value))
                  }
                />
              </Field>
              <Field label={t('solo.leaveYear')}>
                <Input
                  type="number"
                  required
                  min="2000"
                  max="2100"
                  value={policy.leaveAllowanceYear}
                  onChange={(e) =>
                    update('leaveAllowanceYear', Number(e.target.value))
                  }
                />
              </Field>
              <Field label={t('solo.leaveCarry')}>
                <Input
                  type="number"
                  min="0"
                  max="366"
                  step="0.5"
                  value={policy.carryOverDays}
                  onChange={(e) =>
                    update('carryOverDays', Number(e.target.value))
                  }
                />
              </Field>
              <Field label={t('solo.leaveCarryExpiry')}>
                <Input
                  type="date"
                  value={policy.carryOverExpiresOn ?? ''}
                  onChange={(e) =>
                    update('carryOverExpiresOn', e.target.value || null)
                  }
                />
              </Field>
              <Field label={t('solo.leaveAdjustment')}>
                <Input
                  type="number"
                  min="-366"
                  max="366"
                  step="0.5"
                  value={policy.leaveAdjustmentDays}
                  onChange={(e) =>
                    update('leaveAdjustmentDays', Number(e.target.value))
                  }
                />
              </Field>
              <Field label={t('solo.leaveAdjustmentReason')}>
                <Input
                  required={policy.leaveAdjustmentDays !== 0}
                  maxLength={500}
                  value={policy.leaveAdjustmentReason ?? ''}
                  onChange={(e) =>
                    update('leaveAdjustmentReason', e.target.value || null)
                  }
                />
              </Field>
            </div>
          )}
          <Field label={t('employees.holidayCalendar')}>
            <select
              className={selectClass}
              value={policy.holidayCalendar}
              onChange={(e) => update('holidayCalendar', e.target.value)}
            >
              <option value="NONE">{t('employees.holidayCalendarNone')}</option>
              {Object.entries(BUNDESLAND_LABEL).map(([code, label]) => (
                <option key={code} value={`DE-${code}`}>
                  {t('employees.holidayCalendarGermany', { region: label })}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t('employees.holidayDates')}
            hint={t('employees.holidayDatesHint')}
          >
            <textarea
              className={textareaClass}
              value={holidays}
              onChange={(e) => setHolidays(e.target.value)}
            />
          </Field>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              {t('schedules.breakRules')}
            </legend>
            <p className="text-xs text-muted-foreground">
              {t('schedules.breakRulesHint')}
            </p>
            {policy.breakRules.length === 0 && (
              <p className="text-sm">{t('schedules.noBreakRules')}</p>
            )}
            {policy.breakRules.map((rule, index) => (
              <div
                key={index}
                className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <Field label={t('schedules.breakAfter')}>
                  <Input
                    type="number"
                    required
                    min={1}
                    max={10080}
                    value={rule.afterMinutes}
                    onChange={(e) =>
                      update(
                        'breakRules',
                        policy.breakRules.map((r, i) =>
                          i === index
                            ? { ...r, afterMinutes: Number(e.target.value) }
                            : r,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label={t('schedules.breakMinutes')}>
                  <Input
                    type="number"
                    required
                    min={0}
                    max={rule.afterMinutes}
                    value={rule.breakMinutes}
                    onChange={(e) =>
                      update(
                        'breakRules',
                        policy.breakRules.map((r, i) =>
                          i === index
                            ? { ...r, breakMinutes: Number(e.target.value) }
                            : r,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    update(
                      'breakRules',
                      policy.breakRules.filter((_, i) => i !== index),
                    )
                  }
                >
                  {t('common.remove')}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                update('breakRules', [
                  ...policy.breakRules,
                  { afterMinutes: 360, breakMinutes: 30 },
                ])
              }
            >
              {t('schedules.addBreakRule')}
            </Button>
          </fieldset>
          <div className="space-y-3">
            <Check
              label={t('solo.coreHints')}
              checked={policy.coreTimeHintsEnabled}
              onChange={(v) => update('coreTimeHintsEnabled', v)}
            />
            {policy.coreTimeHintsEnabled && (
              <div className="space-y-4 rounded border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('schedules.frameStart')}>
                    <Input
                      type="time"
                      required
                      value={policy.frameStart}
                      onChange={(e) => update('frameStart', e.target.value)}
                    />
                  </Field>
                  <Field label={t('schedules.frameEnd')}>
                    <Input
                      type="time"
                      required
                      value={policy.frameEnd}
                      onChange={(e) => update('frameEnd', e.target.value)}
                    />
                  </Field>
                </div>
                {policy.coreTimes.map((window, index) => (
                  <fieldset
                    key={index}
                    className="space-y-3 rounded border p-3"
                  >
                    <legend className="px-1 text-sm">
                      {t('solo.coreWindow')} {index + 1}
                    </legend>
                    <Field label={t('schedules.coreLabel')}>
                      <Input
                        maxLength={100}
                        value={window.label ?? ''}
                        onChange={(e) =>
                          update(
                            'coreTimes',
                            policy.coreTimes.map((item, i) =>
                              i === index
                                ? { ...item, label: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t('schedules.start')}>
                        <Input
                          type="time"
                          required
                          value={window.start}
                          onChange={(e) =>
                            update(
                              'coreTimes',
                              policy.coreTimes.map((item, i) =>
                                i === index
                                  ? { ...item, start: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label={t('schedules.end')}>
                        <Input
                          type="time"
                          required
                          value={window.end}
                          onChange={(e) =>
                            update(
                              'coreTimes',
                              policy.coreTimes.map((item, i) =>
                                i === index
                                  ? { ...item, end: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {Array.from({ length: 7 }, (_, day) => (
                        <Check
                          key={day}
                          label={new Date(
                            Date.UTC(2024, 0, 1 + day),
                          ).toLocaleDateString(languageTag, {
                            weekday: 'short',
                            timeZone: 'UTC',
                          })}
                          checked={Boolean(window.weekdays & (1 << day))}
                          onChange={() =>
                            update(
                              'coreTimes',
                              policy.coreTimes.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      weekdays: item.weekdays ^ (1 << day),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        update(
                          'coreTimes',
                          policy.coreTimes.filter((_, i) => i !== index),
                        )
                      }
                    >
                      {t('common.remove')}
                    </Button>
                  </fieldset>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={policy.coreTimes.length >= 20}
                  onClick={() =>
                    update('coreTimes', [
                      ...policy.coreTimes,
                      {
                        start: '09:00',
                        end: '12:00',
                        weekdays: policy.workingDays || 31,
                        label: '',
                      },
                    ])
                  }
                >
                  {t('solo.addCoreWindow')}
                </Button>
              </div>
            )}
            <Check
              label={t('solo.dailyBlock')}
              checked={policy.dailyBlockEnabled}
              disabled={!policy.targetEnabled}
              onChange={(v) => update('dailyBlockEnabled', v)}
            />
            <Check
              label={t('solo.gps')}
              checked={policy.gpsEnabled}
              onChange={(v) => update('gpsEnabled', v)}
            />
            <p className="text-xs text-muted-foreground">{t('solo.gpsHint')}</p>
          </div>
          {!installation.setupCompleted && (
            <Check
              label={`${t('solo.setupConfirm')} (${installation.timeZone})`}
              checked={confirmZone}
              onChange={setConfirmZone}
            />
          )}
          <Button
            disabled={
              action.pending ||
              !action.online ||
              (!installation.setupCompleted && !confirmZone)
            }
          >
            {t(
              !installation.setupCompleted
                ? 'solo.setupComplete'
                : 'common.save',
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
function PasswordEditor() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const action = useSoloAction();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('solo.password')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              async () => {
                if (password !== repeat)
                  throw new Error(t('solo.passwordMismatch'));
                await soloApi.password(current, password);
              },
              () => {
                window.alert(t('solo.passwordChanged'));
                logout();
              },
              false,
            );
          }}
        >
          <Feedback action={action} />
          <Field label={t('solo.currentPassword')}>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label={t('solo.newPassword')}>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={t('solo.passwordRepeat')}>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </Field>
          <Button disabled={action.pending || !action.online}>
            {t('solo.password')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
function ModeEditor({ installation }: { installation: Installation }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const action = useSoloAction();
  const [preview, setPreview] = useState<{
    allowed: boolean;
    blockers: string[];
  } | null>(null);
  const next = installation.mode === 'Solo' ? 'Team' : 'Solo';
  useEffect(() => setPreview(null), [installation.mode, installation.revision]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('solo.mode')}: {installation.mode}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{t('solo.modeHint')}</p>
        <Feedback action={action} successMessage={null} />
        <Button
          variant="outline"
          disabled={action.pending || !action.online}
          onClick={() =>
            void action.run(() => soloApi.modePreview(next), setPreview, false)
          }
        >
          {t(next === 'Team' ? 'solo.switchTeam' : 'solo.switchSolo')}
        </Button>
        {preview && (
          <div className="space-y-3 rounded border p-4">
            <p>
              {t(preview.allowed ? 'solo.modeAllowed' : 'solo.modeBlocked')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(next === 'Team' ? 'solo.teamImpact' : 'solo.soloImpact')}
            </p>
            {preview.blockers.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {preview.blockers.map((blocker) => (
                  <li className="break-words" key={blocker}>
                    {t(`solo.blocker.${blocker}`)}
                  </li>
                ))}
              </ul>
            )}
            {preview.allowed && (
              <Button
                disabled={action.pending || !action.online}
                onClick={() =>
                  void action.run(
                    () => soloApi.mode(next, installation.revision),
                    () => navigate(next === 'Solo' ? '/settings' : '/'),
                  )
                }
              >
                {t('solo.modeConfirm')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
