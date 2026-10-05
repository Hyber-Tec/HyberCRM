import { useMemo, useState } from 'react'
import { LuCheck } from 'react-icons/lu'
import { toast } from 'sonner'
import { formatMoney } from '@shared/pay/segment'
import { tutorsNeedAdminRate } from '@shared/pay/rates'
import { formatPhone } from '@shared/people'
import { formatDateKey, todayKey } from '@shared/time'
import type { Compensation } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { compensationRef } from '@/features/employees/api'
import { useDoc } from '@/lib/firestore'
import { type MyDetails, saveMyDetails } from '../api'
import { NOT_LINKED, useMyStaff } from '../hooks'
import { SectionTitle } from './parts'

/** Profile → Account details: the contact details the tutor keeps up to date, and what the center has on file. */
export function AccountSection() {
  const { branchId, staffId, actor, branch, rules, timezone } = useBranch()
  const { data: staff, loading } = useMyStaff()
  const compRef = useMemo(() => (staffId ? compensationRef(branchId, staffId) : null), [branchId, staffId])
  const { data: comp } = useDoc<Compensation>(compRef)
  // Edits live in a draft until saved, so a change elsewhere on the record never wipes them.
  const [draft, setDraft] = useState<MyDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  if (loading) return <Skeleton className="h-72 w-full rounded-xl" />
  if (!staff) return <p className="text-sm text-muted-foreground">{NOT_LINKED}</p>

  const saved: MyDetails = { phone: staff.phone ?? '', dob: staff.dob ?? null, address: staff.address ?? '' }
  const values = draft ?? saved
  const dirty = !!draft && (values.phone.trim() !== saved.phone || (values.dob || null) !== saved.dob || values.address.trim() !== saved.address)
  const edit = (patch: Partial<MyDetails>) => {
    setSavedAt(null)
    setDraft({ ...values, ...patch })
  }

  async function save() {
    if (!staff || !draft) return
    setBusy(true)
    try {
      await saveMyDetails(branchId, actor, staff, draft)
      setDraft(null)
      setSavedAt(Date.now())
      toast.success('Your details are saved')
    } catch (e) {
      toast.error('Couldn’t save your details', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const showAdminRate = tutorsNeedAdminRate(rules, todayKey(timezone))
  const facts: [string, React.ReactNode][] = [
    ['Name', staff.name],
    ['Email', staff.email || '—'],
    ['Started', staff.startDate ? formatDateKey(staff.startDate, 'long') : '—'],
    ...(staff.endDate ? ([['Ends', formatDateKey(staff.endDate, 'long')]] as [string, React.ReactNode][]) : []),
    ['Teaching rate', comp?.rates.teaching ? `${formatMoney(comp.rates.teaching)}/hr` : '—'],
    ...(showAdminRate ? ([['Admin rate', comp?.rates.admin ? `${formatMoney(comp.rates.admin)}/hr` : '—']] as [string, React.ReactNode][]) : []),
  ]

  return (
    <div>
      <SectionTitle title="Account details" description="How the center can reach you, and what it has on file for you." />
      <div className="space-y-6">
        <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="contact-title">
          <div className="border-b px-5 py-4">
            <h3 id="contact-title" className="text-sm font-semibold">
              Contact details
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Only admins at {branch.name} see these.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <FieldGroup className="gap-5 p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="me-phone">Phone</FieldLabel>
                  <Input
                    id="me-phone"
                    type="tel"
                    autoComplete="tel"
                    value={values.phone}
                    placeholder="(555) 010-1234"
                    onChange={(e) => edit({ phone: e.target.value })}
                    onBlur={() => values.phone && edit({ phone: formatPhone(values.phone) })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="me-dob">Date of birth</FieldLabel>
                  <DatePicker
                    id="me-dob"
                    value={values.dob || null}
                    max={todayKey(timezone)}
                    format="long"
                    onChange={(d) => edit({ dob: d })}
                    onClear={() => edit({ dob: null })}
                    placeholder="Pick a date"
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="me-address">Home address</FieldLabel>
                <Input id="me-address" autoComplete="street-address" value={values.address} placeholder="Street, city, ZIP" onChange={(e) => edit({ address: e.target.value })} />
              </Field>
            </FieldGroup>
            <div className="flex items-center justify-end gap-3 border-t bg-muted/30 px-5 py-3">
              {savedAt && !dirty ? (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <LuCheck className="size-4 text-emerald-600" /> Saved
                </span>
              ) : null}
              {dirty ? (
                <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                  Discard
                </Button>
              ) : null}
              <Button type="submit" disabled={!dirty || busy}>
                {busy ? <Spinner /> : null} Save changes
              </Button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="file-title">
          <div className="border-b px-5 py-4">
            <h3 id="file-title" className="text-sm font-semibold">
              At {branch.name}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Kept by the center. Ask an admin to change any of these.</p>
          </div>
          <dl className="divide-y">
            {facts.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 px-5 py-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  )
}
