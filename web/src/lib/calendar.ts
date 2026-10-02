import { formatMinutesShort } from '@shared/time'

const keep = (s: string) => s.replace(/ /g, ' ')

/**
 * "2 PM–4:30 PM" for a calendar box: when the box is narrow it wraps only after
 * the dash ("2 PM–" / "4:30 PM"), never inside a time.
 */
export function boxRange(start: string, end: string): string {
  return `${keep(start)}–​${keep(end)}`
}

/** `boxRange` from wall-clock minutes. */
export function timeRange(startMin: number, endMin: number): string {
  return boxRange(formatMinutesShort(startMin), formatMinutesShort(endMin))
}
