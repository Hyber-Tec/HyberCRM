import { deleteDoc, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { rangesContain } from '@shared/availability'
import { COL, masterAvailabilityDocId } from '@shared/paths'
import { studentLabel } from '@shared/people'
import { buildDayRows, orderTutors } from '@shared/schedule/dayModel'
import { fitsCapacity } from '@shared/schedule/lanes'
import type { DayHours } from '@shared/settings/defaults'
import { WEEKDAY_LABELS, type Weekday, addDays, orderedWeekdays, weekdayOf } from '@shared/time'
import type { AvailabilityRange, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { OptionPicker } from '@/components/app/OptionPicker'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStaffList, useStudentList, useSubjects } from '@/features/data/hooks'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { type ScheduleUi, ScheduleUiContext, type Selection } from './context'
import { DaySection } from './DaySection'
import { SubjectPicker } from './dialogs/SubjectPicker'

export interface MasterSessionDoc {
  weekday: Weekday
  startMin: number
  endMin: number
  tutorId: string
  tutorName: string
  studentId: string
  studentName: string
  studentGrade: string
  subjectId: string | null
  subject: string
  note: string
  status: 'pending' | 'canceled'
  visualOrder: number
  isDeleted: boolean
}

interface MasterAvailability {
  staffId: string
  weekday: Weekday
  ranges: AvailabilityRange[]
  unavailable: boolean
  hidden: boolean
}

interface MasterDayConfig {
  weekday: Weekday
  isOpen: boolean
  openMin: number
  closeMin: number
}

/** A fixed reference week used only to render the template (2000-01-02 is a Sunday). */
const TEMPLATE_SUNDAY = '2000-01-02'
const templateDate = (w: Weekday) => addDays(TEMPLATE_SUNDAY, ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(w))

export function MasterSchedule({ tutorFilter, zoom }: { tutorFilter: string | null; zoom: number }) {
  const { branchId, settings, actor } = useBranch()
  const { data: staff } = useStaffList()
  const { data: students } = useStudentList()
  const { data: subjects } = useSubjects()
  const sessionsQ = useMemo(() => branchCol(branchId, COL.masterSessions), [branchId])
  const availQ = useMemo(() => branchCol(branchId, COL.masterAvailability), [branchId])
  const cfgQ = useMemo(() => branchCol(branchId, COL.masterDayConfigs), [branchId])
  const { data: masterDocs } = useQuery<MasterSessionDoc>(sessionsQ, `master-sessions-${branchId}`)
  const { data: masterAvail } = useQuery<MasterAvailability>(availQ, `master-avail-${branchId}`)
  const { data: masterCfg } = useQuery<MasterDayConfig>(cfgQ, `master-cfg-${branchId}`)
  const [selection, setSelection] = useState<Selection>(null)
  const [dialog, setDialog] = useState<{ session: WithId<MasterSessionDoc> | null; weekday: Weekday; tutorId: string; startMin: number; endMin: number } | null>(null)
  const [dayDialog, setDayDialog] = useState<Weekday | null>(null)
  const maxLanes = settings.schedule.maxConcurrentStudentsPerTutor

  const hoursFor = (w: Weekday): DayHours => {
    const c = masterCfg.find((x) => x.weekday === w)
    return c ? { isOpen: c.isOpen, openMin: c.openMin, closeMin: c.closeMin } : settings.schedule.defaultWeek[w]
  }
  const tutors = orderTutors(
    staff.filter((s) => s.roles.includes('tutor') && s.status !== 'finished'),
    settings.schedule.tutorOrder,
  ).map((s) => ({ id: s.id, name: s.name }))
  const visible = tutorFilter ? tutors.filter((t) => t.id === tutorFilter) : tutors
  const live = masterDocs.filter((m) => !m.isDeleted)
  const asSession = (m: WithId<MasterSessionDoc>): WithId<Session> =>
    ({ ...m, dateKey: templateDate(m.weekday), logStatus: 'none', status: m.status ?? 'pending' }) as unknown as WithId<Session>
  const byId = new Map(live.map((m) => [m.id, m]))

  const availabilityFor = (staffId: string, w: Weekday) => {
    const a = masterAvail.find((x) => x.staffId === staffId && x.weekday === w)
    const h = hoursFor(w)
    // No template availability = available during opening hours.
    return a ? { ranges: a.ranges, unavailable: a.unavailable, hidden: a.hidden } : { ranges: [{ startMin: h.openMin, endMin: h.closeMin }], unavailable: false, hidden: false }
  }

  const days = orderedWeekdays(settings.general.weekStartsOn).filter((w) => hoursFor(w).isOpen)

  async function saveMaster(id: string | null, data: Partial<MasterSessionDoc>, summary: string) {
    const batch = writeBatch(db)
    const ref = id ? branchDocRef(branchId, COL.masterSessions, id) : doc(branchCol(branchId, COL.masterSessions))
    if (id) batch.update(ref, { ...data, updatedAt: serverTimestamp(), updatedBy: actor.email })
    else batch.set(ref, { status: 'pending', visualOrder: 0, isDeleted: false, ...data, createdAt: serverTimestamp(), createdBy: actor.email, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, { action: id ? 'master.update' : 'master.create', category: 'schedule', entityType: 'masterSession', entityId: ref.id, summary })
    await batch.commit()
  }

  const ui: ScheduleUi = {
    mode: 'admin',
    master: true,
    today: '1999-12-31',
    nowMin: 0,
    maxLanes,
    snap: settings.schedule.snapMinutes,
    defaultDuration: settings.schedule.defaultSessionMinutes,
    selection,
    select: setSelection,
    students: new Map(students.map((s) => [s.id, s])),
    isLocked: () => false,
    bellFor: () => [],
    createAt: (staffId, dateKey, startMin, endMin) => setDialog({ session: null, weekday: weekdayOf(dateKey), tutorId: staffId, startMin, endMin }),
    editSession: (s) => {
      const m = byId.get(s.id)
      if (m) setDialog({ session: m, weekday: m.weekday, tutorId: m.tutorId, startMin: m.startMin, endMin: m.endMin })
    },
    setStatus: () => undefined,
    moveSession: (id, staffId, dateKey, startMin) => {
      const m = byId.get(id)
      if (!m) return
      const w = weekdayOf(dateKey)
      const endMin = startMin + (m.endMin - m.startMin)
      const a = availabilityFor(staffId, w)
      if (a.unavailable || !rangesContain(a.ranges, startMin, endMin)) return toast.error('This start time does not fit within the tutor’s template availability.')
      const others = live.filter((x) => x.weekday === w && x.tutorId === staffId && x.status !== 'canceled')
      if (!fitsCapacity(others, startMin, endMin, maxLanes, id)) return toast.error(`This tutor already has ${maxLanes} students at that time.`)
      void saveMaster(id, { weekday: w, startMin, endMin, tutorId: staffId, tutorName: staff.find((x) => x.id === staffId)?.name ?? m.tutorName }, `Moved ${m.studentName}’s template session`)
    },
    resizeSession: (s, startMin, endMin) => void saveMaster(s.id, { startMin, endMin }, `Changed the time of ${s.studentName}’s template session`),
    reorderSession: () => undefined,
    openLog: () => undefined,
    showBell: () => undefined,
    createEvent: () => undefined,
    editEvent: () => undefined,
    moveEvent: () => undefined,
    editDay: (dateKey) => setDayDialog(weekdayOf(dateKey)),
  }

  return (
    <ScheduleUiContext value={ui}>
      <div className="p-3 sm:p-4" style={{ zoom }}>
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          Master Schedule — a weekly template. Use <span className="font-semibold">Duplicate week</span> to copy it into a real week.
        </div>
        <div className="flex flex-col gap-4">
          {days.map((w) => {
            const hours = hoursFor(w)
            const rows = buildDayRows({
              dateKey: templateDate(w),
              today: '1999-12-31',
              hours,
              tutors: visible,
              availability: (id) => availabilityFor(id, w),
              sessions: live.filter((m) => m.weekday === w).map(asSession),
              maxLanes,
              addEmptyLane: true,
              master: true,
            })
            return <DaySection key={w} dateKey={templateDate(w)} hours={hours} rows={rows} events={[]} headerLabel={WEEKDAY_LABELS[w]} />
          })}
        </div>
      </div>
      {dialog ? (
        <MasterSessionDialog
          state={dialog}
          onClose={() => setDialog(null)}
          students={students.map((s) => ({ id: s.id, name: s.name, grade: s.grade }))}
          tutors={tutors}
          subjects={subjects}
          onSave={async (data) => {
            await saveMaster(dialog.session?.id ?? null, data, `${dialog.session ? 'Updated' : 'Added'} a template session for ${data.studentName}`)
            setDialog(null)
          }}
          onDelete={async () => {
            if (!dialog.session) return
            await deleteDoc(branchDocRef(branchId, COL.masterSessions, dialog.session.id))
            setDialog(null)
          }}
        />
      ) : null}
      {dayDialog ? (
        <MasterDayDialog
          weekday={dayDialog}
          hours={hoursFor(dayDialog)}
          tutors={tutors}
          availabilityFor={(id) => availabilityFor(id, dayDialog)}
          onClose={() => setDayDialog(null)}
          onSave={async (cfg, avail) => {
            await setDoc(branchDocRef(branchId, COL.masterDayConfigs, dayDialog), { weekday: dayDialog, ...cfg, updatedAt: serverTimestamp() })
            for (const [staffId, a] of Object.entries(avail)) {
              await setDoc(branchDocRef(branchId, COL.masterAvailability, masterAvailabilityDocId(staffId, dayDialog)), { staffId, weekday: dayDialog, ...a, updatedAt: serverTimestamp() })
            }
            toast.success('Template day saved')
            setDayDialog(null)
          }}
        />
      ) : null}
    </ScheduleUiContext>
  )
}

function MasterSessionDialog({
  state,
  onClose,
  students,
  tutors,
  subjects,
  onSave,
  onDelete,
}: {
  state: { session: WithId<MasterSessionDoc> | null; weekday: Weekday; tutorId: string; startMin: number; endMin: number }
  onClose: () => void
  students: { id: string; name: string; grade: string }[]
  tutors: { id: string; name: string }[]
  subjects: Parameters<typeof SubjectPicker>[0]['subjects']
  onSave: (data: Omit<MasterSessionDoc, 'status' | 'visualOrder' | 'isDeleted'>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const { settings } = useBranch()
  const s = state.session
  const [studentId, setStudentId] = useState(s?.studentId ?? '')
  const [subject, setSubject] = useState({ subjectId: s?.subjectId ?? null, subject: s?.subject ?? '' })
  const [weekday, setWeekday] = useState<Weekday>(state.weekday)
  const [startMin, setStartMin] = useState(state.startMin)
  const [endMin, setEndMin] = useState(state.endMin)
  const [tutorId, setTutorId] = useState(state.tutorId)
  const [note, setNote] = useState(s?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const snap = settings.schedule.snapMinutes
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{s ? 'Edit template session' : 'Add template session'}</DialogTitle>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>Student</FieldLabel>
            <OptionPicker value={studentId || null} onChange={setStudentId} options={students.map((x) => ({ value: x.id, label: studentLabel(x.name, x.grade) }))} placeholder="Search student…" />
          </Field>
          <Field>
            <FieldLabel>Subject</FieldLabel>
            <SubjectPicker subjects={subjects} value={subject} onChange={setSubject} />
          </Field>
          <Field>
            <FieldLabel>Day and time</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={weekday} onValueChange={(v) => setWeekday(v as Weekday)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderedWeekdays(settings.general.weekStartsOn).map((w) => (
                    <SelectItem key={w} value={w}>
                      {WEEKDAY_LABELS[w]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TimeSelect value={startMin} step={snap} min={360} max={1435} onChange={(m) => (setStartMin(m), m >= endMin && setEndMin(m + snap))} />
              <span className="text-sm text-muted-foreground">to</span>
              <TimeSelect value={endMin} step={snap} min={startMin + snap} max={1440} onChange={setEndMin} />
            </div>
          </Field>
          <Field>
            <FieldLabel>Tutor</FieldLabel>
            <Select value={tutorId} onValueChange={setTutorId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select tutor…" />
              </SelectTrigger>
              <SelectContent>
                {tutors.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Short note</FieldLabel>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <DialogFooter className="gap-2 sm:justify-between">
          {s ? (
            <Button variant="destructive" onClick={() => window.confirm('Delete this template session?') && void onDelete()}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const st = students.find((x) => x.id === studentId)
                const tu = tutors.find((x) => x.id === tutorId)
                if (!st) return setError('Choose a student.')
                if (!subject.subject) return setError('Choose or type a subject.')
                if (!tu) return setError('Choose a tutor.')
                if (endMin <= startMin) return setError('The end time must be after the start time.')
                void onSave({ weekday, startMin, endMin, tutorId: tu.id, tutorName: tu.name, studentId: st.id, studentName: st.name, studentGrade: st.grade, subjectId: subject.subjectId, subject: subject.subject, note: note.trim() })
              }}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MasterDayDialog({
  weekday,
  hours,
  tutors,
  availabilityFor,
  onClose,
  onSave,
}: {
  weekday: Weekday
  hours: DayHours
  tutors: { id: string; name: string }[]
  availabilityFor: (id: string) => { ranges: AvailabilityRange[]; unavailable: boolean; hidden: boolean }
  onClose: () => void
  onSave: (cfg: DayHours, avail: Record<string, { ranges: AvailabilityRange[]; unavailable: boolean; hidden: boolean }>) => Promise<void>
}) {
  const [cfg, setCfg] = useState<DayHours>(hours)
  const [avail, setAvail] = useState(() => Object.fromEntries(tutors.map((t) => [t.id, availabilityFor(t.id)])))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Template settings — {WEEKDAY_LABELS[weekday]}</DialogTitle>
        </DialogHeader>
        <ToggleGroup type="single" variant="outline" value={cfg.isOpen ? 'open' : 'closed'} onValueChange={(v) => v && setCfg({ ...cfg, isOpen: v === 'open' })}>
          <ToggleGroupItem value="open">Open</ToggleGroupItem>
          <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
        </ToggleGroup>
        {cfg.isOpen ? (
          <div className="flex items-center gap-2">
            <TimeSelect value={cfg.openMin} step={60} min={360} max={1260} onChange={(m) => setCfg({ ...cfg, openMin: m })} />
            <span className="text-sm text-muted-foreground">to</span>
            <TimeSelect value={cfg.closeMin} step={60} min={cfg.openMin + 60} max={1320} onChange={(m) => setCfg({ ...cfg, closeMin: m })} />
          </div>
        ) : null}
        <div className="divide-y rounded-lg border">
          {tutors.map((t) => {
            const a = avail[t.id]
            const r = a.ranges[0] ?? { startMin: cfg.openMin, endMin: cfg.closeMin }
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="w-36 truncate font-medium">{t.name}</span>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={a.unavailable} onCheckedChange={(v) => setAvail({ ...avail, [t.id]: { ...a, unavailable: v === true, hidden: v === true } })} />
                  Unavailable
                </label>
                {!a.unavailable ? (
                  <div className="ml-auto flex items-center gap-1.5">
                    <TimeSelect className="w-28" value={r.startMin} step={30} min={360} max={1290} onChange={(m) => setAvail({ ...avail, [t.id]: { ...a, ranges: [{ ...r, startMin: m }] } })} />
                    <span className="text-xs text-muted-foreground">to</span>
                    <TimeSelect className="w-28" value={r.endMin} step={30} min={r.startMin + 30} max={1320} onChange={(m) => setAvail({ ...avail, [t.id]: { ...a, ranges: [{ ...r, endMin: m }] } })} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void onSave(cfg, avail)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

