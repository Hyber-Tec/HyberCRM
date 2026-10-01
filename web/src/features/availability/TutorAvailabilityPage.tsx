import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { Staff } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { AvailabilityCalendar } from './AvailabilityCalendar'

export function TutorAvailabilityPage() {
  const { branchId, staffId, settings } = useBranch()
  const ref = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  const { data: staff } = useDoc<Staff>(ref)
  const a = settings.availability
  if (!staffId) return <p className="text-sm text-muted-foreground">Your employee record isn’t linked yet. Ask an admin.</p>
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Availability"
        description={
          <>
            Set your availability at least <span className="font-medium text-foreground">{a.leadTimeDays} days</span> in advance. Changes within{' '}
            <span className="font-medium text-foreground">{a.lockWindowDays} days</span> need an admin.
          </>
        }
      />
      <AvailabilityCalendar staffId={staffId} staffName={staff?.name ?? 'Me'} mode="tutor" />
    </div>
  )
}
