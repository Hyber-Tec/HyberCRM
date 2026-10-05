import { execSync } from 'node:child_process'
import { PROJECT_ID } from './firestore-rest'

/**
 * Minimal Firebase Auth admin client for scripts (Identity Toolkit REST), with the developer's gcloud login, or the
 * Auth emulator when FIREBASE_AUTH_EMULATOR_HOST is set (e.g. 127.0.0.1:9099).
 */
const EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST
const BASE = EMULATOR
  ? `http://${EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`
  : `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`

function headers(): Record<string, string> {
  if (EMULATOR) return { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }
  const account = process.env.HYBER_GCLOUD_ACCOUNT ? ` --account ${process.env.HYBER_GCLOUD_ACCOUNT}` : ''
  const token = execSync(`gcloud auth print-access-token${account}`, { encoding: 'utf8' }).trim()
  return { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT_ID, 'Content-Type': 'application/json' }
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`Auth ${path}: ${res.status} ${text}`)
  return JSON.parse(text || '{}') as T
}

export interface AuthUser {
  localId: string
  email: string
  displayName?: string
  emailVerified?: boolean
  providerUserInfo?: { providerId: string }[]
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const r = await call<{ users?: AuthUser[] }>('/accounts:lookup', { email: [email] })
  return r.users?.[0] ?? null
}

/**
 * A password account with a confirmed email: created, or brought up to date (name, password, confirmed) when it
 * already exists. Returns its uid.
 */
export async function upsertPasswordUser(input: { email: string; password: string; displayName: string }): Promise<{ uid: string; created: boolean }> {
  const existing = await findUserByEmail(input.email)
  if (existing) {
    await call('/accounts:update', { localId: existing.localId, password: input.password, displayName: input.displayName, emailVerified: true })
    return { uid: existing.localId, created: false }
  }
  const r = await call<{ localId: string }>('/accounts', { email: input.email, password: input.password, displayName: input.displayName, emailVerified: true })
  return { uid: r.localId, created: true }
}
