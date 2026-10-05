import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'

// Imported first by every module so the Admin SDK is ready before use.
initializeApp()
setGlobalOptions({ region: 'us-central1', maxInstances: 10 })
export const db = getFirestore()

/**
 * For triggers and jobs that mostly wait on Firestore: a fraction of a vCPU (one request per instance) instead of a
 * whole one. The project's Cloud Run quota is 20 vCPUs per region, and a deploy starts every function at once, so the
 * light ones must not each hold a full vCPU (a full deploy of 31 functions would not fit otherwise).
 */
export const LIGHT = { cpu: 'gcf_gen1' } as const
