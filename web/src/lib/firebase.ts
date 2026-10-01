import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, connectAuthEmulator, getAuth, signInWithCredential } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

// On Firebase Hosting, use the page's own domain for the auth handler so sign-in
// keeps working when browsers block third-party storage.
const onHostedDomain = /\.(web\.app|firebaseapp\.com)$/.test(window.location.hostname)

export const firebaseApp = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: onHostedDomain ? window.location.hostname : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(firebaseApp)
export const db = initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true })
export const storage = getStorage(firebaseApp)
export const functions = getFunctions(firebaseApp, 'us-central1')

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

/** Local end-to-end mode: everything talks to the Firebase emulators. */
export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === '1'

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  // Test hook: sign in as any Google account without the popup (emulator only).
  ;(window as unknown as { __hyberSignIn: (email: string) => Promise<unknown> }).__hyberSignIn = (email: string) =>
    signInWithCredential(
      auth,
      GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name: email.split('@')[0] })),
    )
}
