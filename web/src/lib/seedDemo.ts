import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

/** Super Admin: writes the demo data set into a branch (server side). */
export const seedDemoData = httpsCallable<{ branchId: string }, { count: number }>(functions, 'seedDemoData', { timeout: 300_000 })
