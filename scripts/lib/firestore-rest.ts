import { execSync } from 'node:child_process'

/**
 * Minimal Firestore REST client for admin scripts. It authenticates with the
 * developer's gcloud login (`gcloud auth print-access-token`), so no service-account
 * key is needed. Requests made this way bypass security rules (IAM access).
 */

export const PROJECT_ID = process.env.HYBER_PROJECT ?? 'hyber-crm'
/** When set (e.g. 127.0.0.1:8080), talk to the Firestore emulator instead of production. */
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST
const BASE = EMULATOR
  ? `http://${EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

let cachedToken: { value: string; at: number } | null = null

function token(): string {
  if (EMULATOR) return 'owner'
  if (!cachedToken || Date.now() - cachedToken.at > 30 * 60 * 1000) {
    const account = process.env.HYBER_GCLOUD_ACCOUNT ? ` --account ${process.env.HYBER_GCLOUD_ACCOUNT}` : ''
    cachedToken = { value: execSync(`gcloud auth print-access-token${account}`, { encoding: 'utf8' }).trim(), at: Date.now() }
  }
  return cachedToken.value
}

type Value = Record<string, unknown>

export function encode(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return v.length ? { arrayValue: { values: v.map(encode) } } : { arrayValue: {} }
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } }
  throw new Error(`Cannot encode ${typeof v}`)
}

export function encodeFields(obj: Record<string, unknown>): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = encode(v)
  return out
}

function decode(v: Value): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return new Date(String(v.timestampValue))
  if ('arrayValue' in v) return ((v.arrayValue as { values?: Value[] }).values ?? []).map(decode)
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, Value> }).fields ?? {})
  return undefined
}

function decodeFields(fields: Record<string, Value>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]))
}

async function request(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': PROJECT_ID,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok && res.status !== 404) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return res
}

export async function getDocument(path: string): Promise<Record<string, unknown> | null> {
  const res = await request(`${BASE}/${path}`)
  if (res.status === 404) return null
  const json = (await res.json()) as { fields?: Record<string, Value> }
  return decodeFields(json.fields ?? {})
}

export interface Write {
  path: string
  data: Record<string, unknown>
}

/** Writes documents (full replace) in atomic batches of up to 400. */
export async function commit(writes: Write[], onProgress?: (done: number, total: number) => void) {
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400)
    await request(`${BASE}:commit`, {
      method: 'POST',
      body: JSON.stringify({
        writes: chunk.map((w) => ({
          update: {
            name: `projects/${PROJECT_ID}/databases/(default)/documents/${w.path}`,
            fields: encodeFields(w.data),
          },
        })),
      }),
    })
    onProgress?.(Math.min(i + 400, writes.length), writes.length)
  }
}
