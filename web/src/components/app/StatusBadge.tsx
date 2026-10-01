import { STAFF_STATUS_COLORS, STAFF_STATUS_LABELS, STUDENT_STATUS_COLORS, STUDENT_STATUS_LABELS } from '@shared/people'
import type { StaffStatus, StudentStatus } from '@shared/types'
import { cn } from '@/lib/utils'

function Pill({ label, colors, className }: { label: string; colors: { bg: string; text: string; border: string }; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap', className)}
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: colors.text }} />
      {label}
    </span>
  )
}

export function StudentStatusBadge({ status, className }: { status: StudentStatus; className?: string }) {
  return <Pill label={STUDENT_STATUS_LABELS[status] ?? status} colors={STUDENT_STATUS_COLORS[status] ?? STUDENT_STATUS_COLORS.signed_up} className={className} />
}

export function StaffStatusBadge({ status, className }: { status: StaffStatus; className?: string }) {
  return <Pill label={STAFF_STATUS_LABELS[status] ?? status} colors={STAFF_STATUS_COLORS[status] ?? STAFF_STATUS_COLORS.active} className={className} />
}
