import { LuCircleCheck } from 'react-icons/lu'
import { SESSION_STATUS_LABELS, SESSION_STATUS_STYLE } from '@shared/schedule/status'
import type { SessionStatus } from '@shared/settings/defaults'

export function SessionStatusBadge({ status, logSubmitted }: { status: SessionStatus; logSubmitted?: boolean }) {
  const st = SESSION_STATUS_STYLE[status]
  return (
    <span
      className="inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text }}
    >
      {SESSION_STATUS_LABELS[status]}
      {logSubmitted ? <LuCircleCheck className="size-3.5 text-blue-700" aria-label="Log submitted" /> : null}
    </span>
  )
}
