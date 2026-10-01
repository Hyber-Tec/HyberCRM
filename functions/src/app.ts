import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'

// Imported first by every module so the Admin SDK is ready before use.
initializeApp()
setGlobalOptions({ region: 'us-central1', maxInstances: 10 })
export const db = getFirestore()
