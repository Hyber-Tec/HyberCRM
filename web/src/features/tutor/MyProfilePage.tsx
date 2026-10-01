import { serverTimestamp, updateDoc } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { formatDateKey } from '@shared/time'
import type { Compensation, Staff } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { StaffStatusBadge } from '@/components/app/StatusBadge'
import { UserAvatar } from '@/components/app/UserMenu'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { compensationRef } from '@/features/employees/api'
import { branchDocRef, useDoc } from '@/lib/firestore'

export function MyProfilePage() {
  const { branchId, staffId, actor } = useBranch()
  const { email } = useAuth()
  const ref = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  const { data: staff, loading } = useDoc<Staff>(ref)
  const compRef = useMemo(() => (staffId ? compensationRef(branchId, staffId) : null), [branchId, staffId])
  const { data: comp } = useDoc<Compensation>(compRef)
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPhone(staff?.phone ?? '')
    setDob(staff?.dob ?? '')
    setAddress(staff?.address ?? '')
  }, [staff])

  if (loading) return <Spinner />
  if (!staff || !ref) return <p className="text-sm text-muted-foreground">Your employee record isn’t linked yet. Ask an admin.</p>
  const dirty = phone !== (staff.phone ?? '') || dob !== (staff.dob ?? '') || address !== (staff.address ?? '')

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Profile" description="Your details at this center. Contact an admin to change your name, rates or status." />
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <UserAvatar className="size-12" />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{staff.name}</CardTitle>
            <CardDescription className="truncate">{email}</CardDescription>
          </div>
          <StaffStatusBadge status={staff.status} />
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="me-phone">Phone</FieldLabel>
                <Input id="me-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="me-dob">Date of birth</FieldLabel>
                <DatePicker id="me-dob" value={dob || null} onChange={setDob} onClear={() => setDob('')} placeholder="Birth date" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="me-address">Home address</FieldLabel>
              <Input id="me-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            disabled={!dirty || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await updateDoc(ref, { phone: phone.trim(), dob: dob || null, address: address.trim(), updatedAt: serverTimestamp(), updatedBy: actor.email })
                toast.success('Saved')
              } catch (e) {
                toast.error('Could not save', { description: (e as Error).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner /> : null} Save changes
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Start date</div>
            <div>{staff.startDate ? formatDateKey(staff.startDate, 'long') : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">End date</div>
            <div>{staff.endDate ? formatDateKey(staff.endDate, 'long') : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Teaching rate</div>
            <div className="tabular-nums">{comp ? `$${comp.rates.teaching.toFixed(2)}/hr` : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Admin rate</div>
            <div className="tabular-nums">{comp ? `$${comp.rates.admin.toFixed(2)}/hr` : '—'}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
