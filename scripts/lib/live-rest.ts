import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import type { LiveContext, LiveData, LiveDemoState, LiveRange, LiveWindows, LiveWrite } from '../../shared/src/demo/live'
import { COL, ROOT } from '../../shared/src/paths'
import { resolveBusinessRules } from '../../shared/src/settings/businessRules'
import { resolveSettings } from '../../shared/src/settings/resolve'
import { isValidTimeZone } from '../../shared/src/time'
import { PROJECT_ID, encode, encodeFields } from './firestore-rest'

/**
 * The live demo's REST side for scripts (scripts/demo-live.ts, scripts/demo-reset.ts): range queries that keep each
 * document's update time, and commits with preconditions, increments and dotted fields, so a planner unit is applied
 * exactly as the Cloud Functions apply it. The developer's gcloud login against production, or the emulator when
 * FIRESTORE_EMULATOR_HOST is set (as in scripts/lib/firestore-rest.ts).
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST
const API = EMULATOR ? `http://${EMULATOR}/v1` : 'https://firestore.googleapis.com/v1'
const DB = `projects/${PROJECT_ID}/databases/(default)/documents`

/** Where the scripts write, for their first line of output. */
export const TARGET = EMULATOR ? `the emulator at ${EMULATOR} (project ${PROJECT_ID})` : `PRODUCTION (project ${PROJECT_ID})`
export const ON_EMULATOR = !!EMULATOR

let cachedToken: { value: string; at: number } | null = null

function token(): string {
  if (EMULATOR) return 'owner'
  if (!cachedToken || Date.now() - cachedToken.at > 30 * 60 * 1000) {
    const account = process.env.HYBER_GCLOUD_ACCOUNT ? ` --account ${process.env.HYBER_GCLOUD_ACCOUNT}` : ''
    cachedToken = { value: execSync(`gcloud auth print-access-token${account}`, { encoding: 'utf8' }).trim(), at: Date.now() }
  }
  return cachedToken.value
}

async function post(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT_ID },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}

type Value = Record<string, unknown>

function decode(v: Value): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return new Date(String(v.timestampValue))
  if ('arrayValue' in v) return ((v.arrayValue as { values?: Value[] }).values ?? []).map(decode)
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, Value> }).fields ?? {})
  if ('referenceValue' in v) return v.referenceValue
  return undefined
}

function decodeFields(fields: Record<string, Value>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]))
}

export interface RestDoc {
  id: string
  path: string
  data: Record<string, unknown>
  /** As the server returned it: the precondition for "unchanged since read". */
  updateTime: string
}

const filter = (field: string, op: string, value: string) => ({ fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: value } } })

/** Documents of a collection, all of them or those whose string `field` lies in [from, to]. */
export async function query(collectionPath: string, range?: { field: string } & LiveRange): Promise<RestDoc[]> {
  const parts = collectionPath.split('/')
  const collectionId = parts.pop()!
  const parent = parts.length ? `${DB}/${parts.join('/')}` : DB
  const structuredQuery: Record<string, unknown> = { from: [{ collectionId }] }
  if (range) {
    structuredQuery.where = {
      compositeFilter: { op: 'AND', filters: [filter(range.field, 'GREATER_THAN_OR_EQUAL', range.from), filter(range.field, 'LESS_THAN_OR_EQUAL', range.to)] },
    }
  }
  const out = (await post(`${API}/${parent}:runQuery`, { structuredQuery })) as { document?: { name: string; fields?: Record<string, Value>; updateTime: string } }[]
  return out
    .filter((r) => r.document)
    .map((r) => {
      const path = r.document!.name.split('/documents/')[1]
      return { id: path.split('/').pop()!, path, data: decodeFields(r.document!.fields ?? {}), updateTime: r.document!.updateTime }
    })
}

const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** A random 20-character document ID, like the SDKs make. */
export function autoId(): string {
  return [...randomBytes(20)].map((b) => AUTO_ID_CHARS[b % AUTO_ID_CHARS.length]).join('')
}

function nest(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const parts = key.split('.')
    let cur = out
    for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>
    cur[parts[parts.length - 1]] = value
  }
  return out
}

function restWrite(w: LiveWrite): Record<string, unknown> {
  if (w.op === 'add') return { update: { name: `${DB}/${w.path}/${autoId()}`, fields: encodeFields(w.data) }, currentDocument: { exists: false } }
  const name = `${DB}/${w.path}`
  if (w.op === 'delete') return { delete: name }
  if (w.op === 'create') return { update: { name, fields: encodeFields(w.data) }, currentDocument: { exists: false } }
  if (w.op === 'set') return { update: { name, fields: encodeFields(w.data) } }
  const increments = Object.entries(w.increment ?? {})
  return {
    update: { name, fields: encodeFields(nest(w.data)) },
    updateMask: { fieldPaths: Object.keys(w.data) },
    ...(increments.length ? { updateTransforms: increments.map(([fieldPath, n]) => ({ fieldPath, increment: encode(n) })) } : {}),
    currentDocument: typeof w.ifVersion === 'string' ? { updateTime: w.ifVersion } : { exists: true },
  }
}

/** Commits writes atomically (all or none), with their preconditions. */
export async function commitLive(writes: LiveWrite[]): Promise<void> {
  if (writes.length) await post(`${API}/${DB}:commit`, { writes: writes.map(restWrite) })
}

/** The planner's context for a branch document. */
export function liveContext(branchId: string, branch: Record<string, unknown>, now: Date, stamp: Date): LiveContext {
  const tz = String(branch.timezone ?? '')
  return {
    branchId,
    timezone: isValidTimeZone(tz) ? tz : 'America/New_York',
    settings: resolveSettings(branch.settings as never),
    rules: resolveBusinessRules(branch.businessRules as never),
    now,
    stamp,
  }
}

/** The planner's snapshot of a branch (as the Cloud Functions read it). */
export async function loadLiveData(branchId: string, state: LiveDemoState | null, win: LiveWindows): Promise<LiveData> {
  const base = `${ROOT.branches}/${branchId}`
  const dated = (col: string, r: LiveRange) => query(`${base}/${col}`, { field: 'dateKey', ...r })
  const [staff, students, subjects, dayConfigs, availability, sessions, shifts, open] = await Promise.all([
    query(`${base}/${COL.staff}`),
    query(`${base}/${COL.students}`),
    query(`${base}/${COL.subjects}`),
    dated(COL.dayConfigs, win.dayConfigs),
    dated(COL.availability, win.availability),
    dated(COL.sessions, win.sessions),
    dated(COL.clockShifts, win.shifts),
    query(`${base}/${COL.openShifts}`),
  ])
  const plain = (d: RestDoc) => ({ ...d.data, id: d.id })
  const versioned = (d: RestDoc) => ({ ...d.data, id: d.id, version: d.updateTime })
  return {
    staff: staff.map(plain) as never,
    students: students.map(plain) as never,
    subjects: subjects.map((d) => ({ id: d.id, name: String(d.data.name ?? '') })),
    dayConfigs: dayConfigs.map((d) => ({ ...d.data, dateKey: String(d.data.dateKey ?? d.id) })) as never,
    availability: availability.map(plain) as never,
    sessions: sessions.map(versioned) as never,
    shifts: shifts.map(versioned) as never,
    openShifts: open.map((d) => ({ staffId: d.id, shiftId: String(d.data.shiftId ?? '') })),
    state,
  }
}
