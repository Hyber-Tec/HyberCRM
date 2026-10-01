import type { SessionStatus } from '../settings/defaults'

export const SESSION_STATUSES: readonly SessionStatus[] = ['pending', 'confirmed', 'present', 'no_show', 'canceled']

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  present: 'Present',
  no_show: 'No Show',
  canceled: 'Canceled',
}

/**
 * Session card colors (fixed design tokens, from True Education): the card
 * background shows the status; a blue check means "log submitted".
 */
export const SESSION_STATUS_STYLE: Record<SessionStatus, { bg: string; border: string; text: string }> = {
  pending: { bg: '#FFFFD7', border: '#d4d090', text: '#78610a' },
  confirmed: { bg: '#ECFFE2', border: '#84c970', text: '#166534' },
  present: { bg: '#E6F5FF', border: '#93c5fd', text: '#1e40af' },
  no_show: { bg: '#DFDFDF', border: '#b8b8b8', text: '#57534e' },
  canceled: { bg: '#FFE8E8', border: '#f9a8a8', text: '#991b1b' },
}
