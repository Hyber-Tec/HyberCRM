/**
 * The session card being dragged. Browsers hide drag data until the drop, so the
 * day view reads the grab point from here to draw the start-time guide.
 */
export const sessionDrag: { current: { id: string; grabOffsetMin: number; durationMin: number } | null } = { current: null }
