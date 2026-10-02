import { query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuCircleAlert, LuFileText } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { studentLabel } from '@shared/people'
import { periodLabel, presetPeriod } from '@shared/reports/facts'
import type { ReportPreset } from '@shared/reports/types'
import { type SessionLog, canLog } from '@shared/sessions/logs'
import { type DateKey, formatDateKey, todayKey } from '@shared/time'
import type { Session } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { OptionPicker } from '@/components/app/OptionPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'
import { PRESET_LABELS, callableMessage, generateReport } from './model'

/**
 * Sessions → Progress Reports → New report: pick a student and a period, see
 * what the report will cover, and create a draft (written on the server).
 */
export function NewReportDialog({
  open,
  onOpenChange,
  studentId: initialStudent,
  lastReportTo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId?: string | null
  /** The end of each student's latest report (for "Since the last report"). */
  lastReportTo: Map<string, DateKey>
}) {
  const { branchId, settings, timezone, isAdmin, rules } = useBranch()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const { data: students } = useStudentList()
  const [studentId, setStudentId] = useState<string | null>(initialStudent ?? null)
  const [chosen, setChosen] = useState<ReportPreset | null>(null)
  const [custom, setCustom] = useState<{ from: DateKey; to: DateKey } | null>(null)
  const [busy, setBusy] = useState(false)
  const student = students.find((s) => s.id === studentId)
  const last = studentId ? (lastReportTo.get(studentId) ?? null) : null
  const lastConference = student?.conference?.lastNoteDate ?? null

  const presets: ReportPreset[] = [
    ...(last ? (['since_last'] as const) : []),
    'last_month',
    'this_month',
    'last_30',
    'last_90',
    ...(rules.conferences.enabled && lastConference ? (['since_conference'] as const) : []),
    'custom',
  ]
  const fallback: ReportPreset = settings.progressReports.defaultPeriod === 'since_last' ? (last ? 'since_last' : 'last_month') : settings.progressReports.defaultPeriod
  const preset = chosen && presets.includes(chosen) ? chosen : presets.includes(fallback) ? fallback : 'last_month'
  const period =
    preset === 'custom' && custom
      ? custom
      : presetPeriod(preset, today, { lastReportTo: last, lastConference, firstSession: student?.firstSessionDate ?? null })

  // What the report will cover (staff can read the student's logs).
  const logsQ = useMemo(
    () =>
      open && studentId
        ? query(branchCol(branchId, COL.sessionLogs), where('studentId', '==', studentId), where('status', '==', 'submitted'), where('dateKey', '>=', period.from), where('dateKey', '<=', period.to))
        : null,
    [open, branchId, studentId, period.from, period.to],
  )
  const logs = useQuery<SessionLog>(logsQ, `new-report-logs-${studentId}-${period.from}-${period.to}`)
  // Admins also see past sessions that still have no log.
  const sessionsQ = useMemo(
    () => (open && studentId && isAdmin ? query(branchCol(branchId, COL.sessions), where('studentId', '==', studentId), where('dateKey', '>=', period.from), where('dateKey', '<=', period.to)) : null),
    [open, branchId, studentId, isAdmin, period.from, period.to],
  )
  const sessions = useQuery<Session>(sessionsQ, `new-report-sessions-${studentId}-${period.from}-${period.to}`)
  const hours = Math.round(logs.data.reduce((n, l) => n + (l.usedHours ?? 0), 0) * 10) / 10
  const dates = logs.data.map((l) => l.dateKey).sort()
  const unlogged = sessions.data.filter(
    (s) => !s.isDeleted && s.logStatus !== 'submitted' && canLog(s.status, settings.sessionLogs.allowForStatuses) && (s.endAt?.toMillis?.() ?? 0) <= now,
  ).length
  const ready = !!studentId && !logs.loading && logs.data.length > 0

  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setChosen(null)
      setCustom(null)
      if (!initialStudent) setStudentId(null)
    }
  }

  async function create() {
    if (!studentId) return
    setBusy(true)
    try {
      const res = await generateReport({ branchId, studentId, from: period.from, to: period.to, preset })
      if (res.data.reused) toast.info('A draft for this period already exists, so it was opened.')
      else toast.success('Draft ready. Review it, then share it with the family.')
      close(false)
      navigate(`/${branchId}/${isAdmin ? 'admin' : 'tutor'}/sessions/progress-reports/${res.data.reportId}`)
    } catch (e) {
      toast.error(callableMessage(e, 'Could not create the report.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New progress report</DialogTitle>
          <DialogDescription>We’ll draft it from the session logs. You can review and edit it before sharing it with the family.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel>Student</FieldLabel>
            <OptionPicker
              value={studentId}
              onChange={(v) => {
                setStudentId(v)
                setChosen(null)
              }}
              placeholder="Choose a student…"
              searchPlaceholder="Search students…"
              options={students
                .filter((s) => s.status !== 'finished' || lastReportTo.has(s.id))
                .map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade), hint: lastReportTo.get(s.id) ? `last report ${formatDateKey(lastReportTo.get(s.id)!, 'monthDay')}` : undefined }))}
            />
          </Field>
          <Field>
            <FieldLabel>Period</FieldLabel>
            <Select value={preset} onValueChange={(v) => setChosen(v as ReportPreset)}>
              <SelectTrigger className="w-full" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {preset === 'custom' ? (
              <div className="mt-2 flex items-center gap-2">
                <DatePicker className="flex-1" value={period.from} max={today} onChange={(d) => setCustom({ from: d, to: d > period.to ? d : period.to })} aria-label="From" />
                <span className="text-sm text-muted-foreground">to</span>
                <DatePicker className="flex-1" value={period.to} min={period.from} max={today} onChange={(d) => setCustom({ from: period.from, to: d })} aria-label="To" />
              </div>
            ) : null}
          </Field>

          {studentId ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm" data-testid="new-report-preview">
              {logs.loading ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Spinner /> Looking at the session logs…
                </span>
              ) : logs.data.length ? (
                <div className="flex items-start gap-2">
                  <LuFileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="font-medium">
                      {logs.data.length} session{logs.data.length === 1 ? '' : 's'} · {hours} hour{hours === 1 ? '' : 's'} · {periodLabel(period.from, period.to)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Logs from {formatDateKey(dates[0], 'monthDay')} to {formatDateKey(dates[dates.length - 1], 'monthDay')}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <LuCircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    There are no submitted session logs in this period.
                    {preset !== 'last_30' && preset !== 'last_90' ? (
                      <button type="button" className="ml-1 font-medium underline underline-offset-2" onClick={() => setChosen('last_30')}>
                        Use the last 30 days
                      </button>
                    ) : null}
                  </span>
                </div>
              )}
              {unlogged ? (
                <div className="mt-2 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <LuCircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {unlogged} past session{unlogged === 1 ? '' : 's'} in this period {unlogged === 1 ? 'has' : 'have'} no submitted log yet.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={!ready || busy}>
            {busy ? <Spinner /> : null}
            {busy ? (settings.progressReports.ai.enabled ? 'Writing the report…' : 'Preparing…') : 'Create draft'}
          </Button>
        </DialogFooter>
        {busy && settings.progressReports.ai.enabled ? <p className="-mt-2 text-right text-xs text-muted-foreground">This takes about 20 seconds.</p> : null}
      </DialogContent>
    </Dialog>
  )
}
