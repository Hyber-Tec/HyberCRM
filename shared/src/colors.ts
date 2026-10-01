/** Calendar colors assigned to employees (schedule rows, Employee Calendar). */
export const STAFF_COLORS: readonly string[] = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#4f46e5', '#dc2626', '#0d9488',
]

export function pickStaffColor(index: number): string {
  return STAFF_COLORS[((index % STAFF_COLORS.length) + STAFF_COLORS.length) % STAFF_COLORS.length]
}
