import type { SessionStatus } from '@shared/settings/defaults'

/**
 * Session cards on the schedule: the softer version of the status colors (the
 * owner's pick of the redesign); badges elsewhere keep SESSION_STATUS_STYLE.
 * `bar` is the strong color, for legend dots.
 */
export const SESSION_CARD_STYLE: Record<SessionStatus, { bg: string; border: string; bar: string; text: string }> = {
  pending: { bg: '#FEF9C3', border: '#FDE68A', bar: '#EAB308', text: '#854D0E' },
  confirmed: { bg: '#DCFCE7', border: '#BBF7D0', bar: '#22C55E', text: '#166534' },
  present: { bg: '#DBEAFE', border: '#BFDBFE', bar: '#3B82F6', text: '#1E40AF' },
  no_show: { bg: '#F4F4F5', border: '#E4E4E7', bar: '#A1A1AA', text: '#52525B' },
  canceled: { bg: '#FEE2E2', border: '#FECACA', bar: '#EF4444', text: '#991B1B' },
}
