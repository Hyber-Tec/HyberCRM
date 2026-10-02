import { query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuFileText, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours, effectiveRanges, rangesContain } from '@shared/availability'
import { COL } from '@shared/paths'
import { studentLabel } from '@shared/people'
import type { Conflict } from '@shared/schedule/conflicts'
import { orderTutors } from '@shared/schedule/dayModel'
import { seatsLeft } from '@shared/schedule/lanes'
import { SESSION_STATUSES, SESSION_STATUS_LABELS } from '@shared/schedule/status'
import { canLog } from '@shared/sessions/logs'
import type { SessionStatus } from '@shared/settings/defaults'
import { type DateKey, formatDateKey, formatTimeRange } from '@shared/time'
import type { Availability, Session, Staff, Student, Subject, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { OptionPicker } from '@/components/app/OptionPicker'
import { TimeSelect } from '@/components/app/TimeSelect'
import { DatePicker } from '@/components/app/DatePicker'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useDayConfigs } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { StudentMonthCalendar } from '../StudentMonthCalendar'
import { LOGGED_STAYS_PRESENT, type SessionDraft } from '../api'
import { SubjectPicker } from './SubjectPicker'

export type SessionDialogState =
  | { mode: 'create'; draft: Partial<SessionDraft> & { dateKey: DateKey; startMin: number; endMin: number } }
  | { mode: 'edit'; session: WithId<Session> }
  | null

export function SessionDialog({
  state,
  onClose,
  students,
  staff,
  subjects,
  isLocked,
  onSave,
  onDelete,
  onOpenLog,
  conflicts = [],
}: {
  state: SessionDialogState
  onClose: () => void
  students: WithId<Student>[]
  staff: WithId<Staff>[]
  subjects: WithId<Subject>[]
  isLocked: (d: DateKey) => boolean
  onSave: (draft: SessionDraft, existing: WithId<Session> | null) => Promise<void>
  onDelete: (s: WithId<Session>) => Promise<void>
  onOpenLog: (s: WithId<Session>) => void
  /** Why the session being edited may not happen as booked. */
  conflicts?: Conflict[]
}) {
  const { branchId, settings, rules } = useBranch()
  const [form, setForm] = useState<SessionDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const existing = state?.mode === 'edit' ? state.session : null
  const readOnly = existing ? isLocked(existing.dateKey) : false

  useEffect(() => {
    setError(null)
    if (!state) return setForm(null)
    if (state.mode === 'edit') {
      const s = state.session
      setForm({
        tutorId: s.tutorId,
        tutorName: s.tutorName,
        studentId: s.studentId,
        studentName: s.studentName,
        studentGrade: s.studentGrade,
        subjectId: s.subjectId,
        subject: s.subject,
        note: s.note,
        status: s.status,
        dateKey: s.dateKey,
        startMin: s.startMin,
        endMin: s.endMin,
      })
    } else {
      const d = state.draft
      setForm({
        tutorId: d.tutorId ?? '',
        tutorName: d.tutorName ?? '',
        studentId: d.studentId ?? '',
        studentName: d.studentName ?? '',
        studentGrade: d.studentGrade ?? '',
        subjectId: d.subjectId ?? null,
        subject: d.subject ?? '',
        note: d.note ?? '',
        status: d.status ?? 'pending',
        dateKey: d.dateKey,
        startMin: d.startMin,
        endMin: d.endMin,
      })
    }
  }, [state])

  const date = form?.dateKey ?? ''
  const { map: dayConfigs } = useDayConfigs(date || '0000-00-00', date || '0000-00-00')
  const hours = date ? dayHours(date, settings, dayConfigs) : null
  const availQ = useMemo(() => (date ? query(branchCol(branchId, COL.availability), where('dateKey', '==', date)) : null), [branchId, date])
  const sessQ = useMemo(() => (date ? query(branchCol(branchId, COL.sessions), where('dateKey', '==', date)) : null), [branchId, date])
  const { data: avail } = useQuery<Availability>(availQ, `dlg-avail-${date}`)
  const { data: daySessions } = useQuery<Session>(sessQ, `dlg-sess-${date}`)

  const tutors = useMemo(() => orderTutors(staff.filter((s) => s.role === 'tutor' && s.status !== 'finished'), settings.schedule.tutorOrder), [staff, settings.schedule.tutorOrder])
  const options = useMemo(() => {
    if (!form || !hours) return []
    return tutors.map((t) => {
      const a = avail.find((x) => x.staffId === t.id)
      const available = !!a && !a.unavailable && rangesContain(effectiveRanges(a.ranges, hours), form.startMin, form.endMin)
      const items = daySessions.filter((s) => s.tutorId === t.id && !s.isDeleted && s.status !== 'canceled')
      const left = seatsLeft(items, form.startMin, form.endMin, rules.maxStudentsPerTutor, existing?.id)
      return { tutor: t, ok: hours.isOpen && available && left > 0, left }
    })
  }, [form, hours, tutors, avail, daySessions, rules.maxStudentsPerTutor, existing?.id])

  if (!state || !form) return null
  const set = (patch: Partial<SessionDraft>) => setForm((f) => (f ? { ...f, ...patch } : f))
  const closed = hours ? !hours.isOpen : false
  const pastDate = !existing && isLocked(form.dateKey)
  const current = options.find((o) => o.tutor.id === form.tutorId)
  const tutorRecord = staff.find((t) => t.id === form.tutorId) ?? null
  const teaches = (t: Staff) => !!form.subjectId && (t.subjectIds ?? []).includes(form.subjectId)
  const studentOptions = students.map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade), hint: s.status === 'finished' ? 'finished' : undefined }))
  const snap = settings.schedule.snapMinutes

  async function save() {
    if (!form) return
    if (!form.studentId) return setError('Choose a student.')
    if (!form.subject.trim()) return setError('Choose or type a subject.')
    if (closed && (!existing || existing.dateKey !== form.dateKey)) return setError('This day is closed — please choose another date.')
    if (pastDate) return setError('Past days can’t be changed.')
    if (form.endMin <= form.startMin) return setError('The end time must be after the start time.')
    if (!form.tutorId) return setError('Choose a tutor.')
    // A session in conflict can still get a new status, subject or note: the tutor's
    // time and seat are checked when the tutor, date or time change.
    const moved =
      !existing || existing.tutorId !== form.tutorId || existing.dateKey !== form.dateKey || existing.startMin !== form.startMin || existing.endMin !== form.endMin
    const opt = options.find((o) => o.tutor.id === form.tutorId)
    if (moved && !opt?.ok) return setError('The selected tutor is unavailable or fully booked at this time. Choose another tutor or time.')
    setBusy(true)
    try {
      await onSave(form, existing)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? (readOnly ? 'View session' : 'Edit session') : 'Create session'}
            {existing ? <span className="font-normal text-muted-foreground"> · {existing.studentName}</span> : null}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="order-2 lg:order-1">
            <div className="mb-2 text-sm text-muted-foreground">
              {form.studentId ? `${form.studentName}’s calendar — click a day to set the date.` : 'Choose a student to see their calendar.'}
            </div>
            <StudentMonthCalendar
              studentId={form.studentId || null}
              selectedDate={form.dateKey}
              onPickDay={readOnly ? undefined : (d) => set({ dateKey: d })}
              highlightSessionId={existing?.id}
              compact
              className="h-[min(56svh,460px)]"
            />
          </div>
          <div className="order-1 lg:order-2">
            <div className="mb-3">
              <div className="font-semibold">Session details</div>
              <div className="text-sm text-muted-foreground">{formatDateKey(form.dateKey, 'weekdayLong')}</div>
            </div>
            {readOnly ? (
              <Alert className="mb-3 border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/30">
                <AlertDescription>View only — past session.</AlertDescription>
              </Alert>
            ) : null}
            {existing && !readOnly && conflicts.length > 0 ? (
              <Alert className="mb-3 border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" data-testid="dialog-conflict">
                <LuTriangleAlert />
                <AlertTitle>This session is in conflict</AlertTitle>
                <AlertDescription className="text-red-800 dark:text-red-300">
                  {conflicts.map((c) => c.message).join(' ')} Change the date or time, choose another tutor, or cancel it.
                </AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Student</FieldLabel>
                <OptionPicker
                  value={form.studentId || null}
                  disabled={!!existing}
                  onChange={(id) => {
                    const st = students.find((s) => s.id === id)
                    if (st) set({ studentId: st.id, studentName: st.name, studentGrade: st.grade })
                  }}
                  options={studentOptions}
                  placeholder="Search student…"
                  searchPlaceholder="Search student…"
                />
              </Field>
              {existing ? (
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <Select value={form.status} onValueChange={(v) => set({ status: v as SessionStatus })} disabled={readOnly}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} disabled={existing.logStatus === 'submitted' && s !== 'present' && s !== existing.status}>
                          {SESSION_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {existing.logStatus === 'submitted' ? <FieldDescription>{LOGGED_STAYS_PRESENT}</FieldDescription> : null}
                </Field>
              ) : null}
              <Field>
                <FieldLabel>Subject</FieldLabel>
                <SubjectPicker
                  subjects={subjects}
                  value={{ subjectId: form.subjectId, subject: form.subject }}
                  onChange={(v) => set(v)}
                  disabled={readOnly}
                  tutor={tutorRecord ? { name: tutorRecord.name, subjectIds: tutorRecord.subjectIds ?? [] } : null}
                />
              </Field>
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <Field>
                  <FieldLabel htmlFor="sd-date">Date</FieldLabel>
                  <DatePicker id="sd-date" value={form.dateKey} disabled={readOnly} onChange={(d) => set({ dateKey: d })} />
                </Field>
              </div>
              {closed ? <FieldError>This day is closed — please choose another date.</FieldError> : null}
              <Field>
                <FieldLabel>Time</FieldLabel>
                <div className="flex items-center gap-2">
                  <TimeSelect
                    value={form.startMin}
                    step={snap}
                    min={hours?.openMin ?? 0}
                    max={(hours?.closeMin ?? 1440) - snap}
                    disabled={readOnly}
                    onChange={(m) => set({ startMin: m, endMin: Math.max(form.endMin, m + snap) })}
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <TimeSelect
                    value={form.endMin}
                    step={snap}
                    min={form.startMin + snap}
                    max={hours?.closeMin ?? 1440}
                    disabled={readOnly}
                    onChange={(m) => set({ endMin: m })}
                  />
                </div>
                {hours?.isOpen ? (
                  <div className="text-xs text-muted-foreground">Open {formatTimeRange(hours.openMin, hours.closeMin)}</div>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Tutor</FieldLabel>
                <Select
                  value={form.tutorId || undefined}
                  disabled={readOnly || closed}
                  onValueChange={(id) => {
                    const t = staff.find((s) => s.id === id)
                    if (t) set({ tutorId: t.id, tutorName: t.name })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={closed ? '— Closed —' : 'Select tutor…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {options
                      .filter((o) => o.ok)
                      // Tutors who teach the subject come first (a hint only; anyone free can be booked).
                      .sort((a, b) => Number(teaches(b.tutor)) - Number(teaches(a.tutor)))
                      .map((o) => (
                        <SelectItem key={o.tutor.id} value={o.tutor.id}>
                          {o.tutor.name} ({o.left} seat{o.left === 1 ? '' : 's'} left)
                          {teaches(o.tutor) ? <span className="text-xs text-emerald-700 dark:text-emerald-400">· teaches {form.subject}</span> : null}
                        </SelectItem>
                      ))}
                    {form.tutorId && !current?.ok ? (
                      <SelectItem value={form.tutorId}>{form.tutorName || 'Current tutor'} (unavailable)</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="sd-note">Short note</FieldLabel>
                <Textarea id="sd-note" rows={2} value={form.note} disabled={readOnly} onChange={(e) => set({ note: e.target.value })} placeholder="Optional note…" />
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {existing && !readOnly ? (
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm('Delete this session?')) return
                  await onDelete(existing)
                  onClose()
                }}
              >
                <LuTrash2 /> Delete
              </Button>
            ) : null}
            {existing && (existing.logStatus === 'submitted' || canLog(existing.status, settings.sessionLogs.allowForStatuses)) ? (
              <Button
                variant="outline"
                onClick={() => onOpenLog(existing)}
                title={
                  existing.logStatus === 'submitted'
                    ? 'A log already exists for this session — open it to review or edit'
                    : 'Add a session log for this session on behalf of the tutor'
                }
                className={existing.logStatus === 'submitted' ? 'border-green-200 bg-green-50 text-green-700' : undefined}
              >
                <LuFileText /> {existing.logStatus === 'submitted' ? 'View session log' : 'Add session log'}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly ? (
              <Button disabled={busy || closed} onClick={() => void save()}>
                {busy ? <Spinner /> : null} {existing ? 'Apply' : 'Create session'}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function toastError(e: unknown) {
  toast.error((e as Error).message)
}
