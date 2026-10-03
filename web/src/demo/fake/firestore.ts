/**
 * An in-memory stand-in for `firebase/firestore`, used only by the demo build
 * (`vite.demo.config.ts` aliases the SDK to this file). Documents live in a Map
 * and the subset of the API the app uses works the same way: references,
 * queries (where, orderBy, limit, collection groups), live listeners, batches
 * and field values. Nothing leaves the browser; a reload starts over.
 */

type Data = Record<string, unknown>

// ------------------------------------------------------------------ values

export class Timestamp {
  readonly seconds: number
  readonly nanoseconds: number

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }

  static now() {
    return Timestamp.fromMillis(Date.now())
  }

  static fromDate(date: Date) {
    return Timestamp.fromMillis(date.getTime())
  }

  static fromMillis(ms: number) {
    const seconds = Math.floor(ms / 1000)
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6))
  }

  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6)
  }

  toDate() {
    return new Date(this.toMillis())
  }

  isEqual(other: unknown) {
    return other instanceof Timestamp && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds
  }

  /** Sortable like the SDK's (so `<` and `>` work on timestamps). */
  valueOf() {
    return `${String(this.seconds + 1e11).padStart(12, '0')}.${String(this.nanoseconds).padStart(9, '0')}`
  }

  toJSON() {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds, type: 'firestore/timestamp/1.0' }
  }

  toString() {
    return `Timestamp(seconds=${this.seconds}, nanoseconds=${this.nanoseconds})`
  }
}

class FieldValue {
  readonly kind: 'serverTimestamp' | 'delete' | 'arrayUnion' | 'arrayRemove' | 'increment'
  readonly arg: unknown

  constructor(kind: FieldValue['kind'], arg?: unknown) {
    this.kind = kind
    this.arg = arg
  }

  isEqual(other: unknown) {
    return other instanceof FieldValue && other.kind === this.kind
  }
}

export const serverTimestamp = () => new FieldValue('serverTimestamp')
export const deleteField = () => new FieldValue('delete')
export const arrayUnion = (...values: unknown[]) => new FieldValue('arrayUnion', values)
export const arrayRemove = (...values: unknown[]) => new FieldValue('arrayRemove', values)
export const increment = (n: number) => new FieldValue('increment', n)

const isPlainObject = (v: unknown): v is Data =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof FieldValue) && !(v instanceof Date) && !(v instanceof DocumentReference)

/** Deep copy for readers (timestamps are immutable and shared). */
function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T
  if (isPlainObject(v)) {
    const out: Data = {}
    for (const [k, x] of Object.entries(v)) out[k] = clone(x)
    return out as T
  }
  return v
}

/** A written value as stored: dates become timestamps, undefined is dropped, field values are applied to `prev`. */
function written(v: unknown, prev: unknown): unknown {
  if (v instanceof FieldValue) {
    switch (v.kind) {
      case 'serverTimestamp':
        return Timestamp.now()
      case 'increment':
        return (typeof prev === 'number' ? prev : 0) + (v.arg as number)
      case 'arrayUnion': {
        const out = Array.isArray(prev) ? [...prev] : []
        for (const x of v.arg as unknown[]) if (!out.some((y) => equals(x, y))) out.push(written(x, undefined))
        return out
      }
      case 'arrayRemove':
        return Array.isArray(prev) ? prev.filter((y) => !(v.arg as unknown[]).some((x) => equals(x, y))) : []
      case 'delete':
        return undefined
    }
  }
  if (v instanceof Date) return Timestamp.fromDate(v)
  if (Array.isArray(v)) return v.filter((x) => x !== undefined).map((x) => written(x, undefined))
  if (isPlainObject(v)) {
    const out: Data = {}
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) continue
      const w = written(x, undefined)
      if (w !== undefined) out[k] = w
    }
    return out
  }
  return v
}

/** `set(…, { merge: true })`: maps merge field by field, everything else replaces. */
function merged(prev: unknown, patch: Data): Data {
  const out: Data = isPlainObject(prev) ? { ...prev } : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (v instanceof FieldValue && v.kind === 'delete') delete out[k]
    else if (isPlainObject(v)) out[k] = merged(out[k], v)
    else out[k] = written(v, out[k])
  }
  return out
}

/** `update(…)`: dotted keys reach into maps; values replace (maps too). */
function updated(prev: Data, patch: Data): Data {
  const out = clone(prev)
  for (const [key, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const parts = key.split('.')
    let node = out
    for (const p of parts.slice(0, -1)) {
      if (!isPlainObject(node[p])) node[p] = {}
      node = node[p] as Data
    }
    const last = parts[parts.length - 1]
    const w = written(v, node[last])
    if (w === undefined) delete node[last]
    else node[last] = w
  }
  return out
}

function getField(data: Data | undefined, field: string): unknown {
  let v: unknown = data
  for (const p of field.split('.')) {
    if (!isPlainObject(v)) return undefined
    v = v[p]
  }
  return v
}

// Firestore's order of value types.
function rank(v: unknown): number {
  if (v === null) return 0
  if (typeof v === 'boolean') return 1
  if (typeof v === 'number') return 2
  if (v instanceof Timestamp) return 3
  if (typeof v === 'string') return 4
  if (v instanceof DocumentReference) return 6
  if (Array.isArray(v)) return 8
  return 9
}

function compare(a: unknown, b: unknown): number {
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() - b.toMillis() || a.nanoseconds - b.nanoseconds
  if (typeof a === 'number' || typeof a === 'boolean') return Number(a) - Number(b)
  if (typeof a === 'string') return a < (b as string) ? -1 : a > (b as string) ? 1 : 0
  if (a instanceof DocumentReference) return compare(a.path, (b as DocumentReference).path)
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    for (let i = 0; i < Math.min(a.length, bb.length); i++) {
      const c = compare(a[i], bb[i])
      if (c) return c
    }
    return a.length - bb.length
  }
  return 0
}

function equals(a: unknown, b: unknown): boolean {
  if (a instanceof Timestamp) return a.isEqual(b)
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => equals(x, b[i]))
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false
    const ka = Object.keys(a)
    return ka.length === Object.keys(b).length && ka.every((k) => equals(a[k], b[k]))
  }
  if (a instanceof DocumentReference) return b instanceof DocumentReference && a.path === b.path
  return a === b
}

// -------------------------------------------------------------- references

const split = (...parts: string[]) => parts.flatMap((p) => p.split('/')).filter(Boolean)

const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function autoId() {
  let id = ''
  for (let i = 0; i < 20; i++) id += AUTO_ID_CHARS[Math.floor(Math.random() * AUTO_ID_CHARS.length)]
  return id
}

export class Firestore {
  readonly type = 'firestore'
  readonly app: unknown

  constructor(app: unknown) {
    this.app = app
  }
}

let db = new Firestore(null)

export function initializeFirestore(app: unknown) {
  db = new Firestore(app)
  return db
}

export function getFirestore() {
  return db
}

export function connectFirestoreEmulator() {}

type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any'
interface Filter {
  field: string
  op: Op
  value: unknown
}
interface Order {
  field: string
  dir: 'asc' | 'desc'
}
interface QuerySpec {
  /** A collection path, or a collection ID for a collection group. */
  source: { kind: 'collection'; path: string } | { kind: 'group'; id: string }
  filters: Filter[]
  orders: Order[]
  limit: number | null
}

export class Query {
  readonly type: 'query' | 'collection' = 'query'
  readonly spec: QuerySpec

  constructor(spec: QuerySpec) {
    this.spec = spec
  }

  get firestore() {
    return db
  }

  withConverter() {
    return this
  }
}

export class CollectionReference extends Query {
  override readonly type = 'collection' as const
  readonly path: string

  constructor(path: string) {
    super({ source: { kind: 'collection', path }, filters: [], orders: [], limit: null })
    this.path = path
  }

  get id() {
    return this.path.split('/').pop()!
  }

  get parent(): DocumentReference | null {
    const parts = this.path.split('/')
    return parts.length > 1 ? new DocumentReference(parts.slice(0, -1).join('/')) : null
  }
}

export class DocumentReference {
  readonly type = 'document'
  readonly path: string

  constructor(path: string) {
    this.path = path
  }

  get id() {
    return this.path.split('/').pop()!
  }

  get parent() {
    return new CollectionReference(this.path.split('/').slice(0, -1).join('/'))
  }

  get firestore() {
    return db
  }

  withConverter() {
    return this
  }
}

type Parent = Firestore | DocumentReference | CollectionReference

export function doc(parent: Parent, ...segments: string[]): DocumentReference {
  if (parent instanceof CollectionReference && segments.length === 0) return new DocumentReference(`${parent.path}/${autoId()}`)
  const base = parent instanceof Firestore ? [] : [parent.path]
  const parts = split(...base, ...segments)
  if (parts.length % 2 !== 0) throw new Error(`Invalid document path: ${parts.join('/')}`)
  return new DocumentReference(parts.join('/'))
}

export function collection(parent: Parent, ...segments: string[]): CollectionReference {
  const base = parent instanceof Firestore ? [] : [parent.path]
  const parts = split(...base, ...segments)
  if (parts.length % 2 !== 1) throw new Error(`Invalid collection path: ${parts.join('/')}`)
  return new CollectionReference(parts.join('/'))
}

export function collectionGroup(_db: Firestore, id: string): Query {
  return new Query({ source: { kind: 'group', id }, filters: [], orders: [], limit: null })
}

type Constraint = { type: 'where'; filter: Filter } | { type: 'orderBy'; order: Order } | { type: 'limit'; n: number }

export const where = (field: string, op: Op, value: unknown): Constraint => ({ type: 'where', filter: { field, op, value: written(value, undefined) } })
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc'): Constraint => ({ type: 'orderBy', order: { field, dir } })
export const limit = (n: number): Constraint => ({ type: 'limit', n })

export function query(base: Query, ...constraints: Constraint[]): Query {
  const spec: QuerySpec = { ...base.spec, filters: [...base.spec.filters], orders: [...base.spec.orders] }
  for (const c of constraints) {
    if (c.type === 'where') spec.filters.push(c.filter)
    else if (c.type === 'orderBy') spec.orders.push(c.order)
    else spec.limit = c.n
  }
  return new Query(spec)
}

// ------------------------------------------------------------------- store

interface Entry {
  data: Data
  version: number
}

/** Collection path → document ID → document. */
const store = new Map<string, Map<string, Entry>>()
let clock = 0

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/'))
const idOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function read(path: string): Entry | undefined {
  return store.get(parentOf(path))?.get(idOf(path))
}

function put(path: string, data: Data | undefined) {
  const col = parentOf(path)
  if (data === undefined) {
    store.get(col)?.delete(idOf(path))
    return
  }
  if (!store.has(col)) store.set(col, new Map())
  store.get(col)!.set(idOf(path), { data, version: ++clock })
}

const INEQUALITIES = new Set<Op>(['<', '<=', '>', '>=', '!=', 'not-in'])

function matches(data: Data, f: Filter): boolean {
  const v = getField(data, f.field)
  if (v === undefined) return false
  switch (f.op) {
    case '==':
      return equals(v, f.value)
    case '!=':
      return v !== null && !equals(v, f.value)
    case '<':
      return rank(v) === rank(f.value) && compare(v, f.value) < 0
    case '<=':
      return rank(v) === rank(f.value) && compare(v, f.value) <= 0
    case '>':
      return rank(v) === rank(f.value) && compare(v, f.value) > 0
    case '>=':
      return rank(v) === rank(f.value) && compare(v, f.value) >= 0
    case 'in':
      return (f.value as unknown[]).some((x) => equals(v, x))
    case 'not-in':
      return v !== null && !(f.value as unknown[]).some((x) => equals(v, x))
    case 'array-contains':
      return Array.isArray(v) && v.some((x) => equals(x, f.value))
    case 'array-contains-any':
      return Array.isArray(v) && v.some((x) => (f.value as unknown[]).some((y) => equals(x, y)))
  }
}

interface Row {
  path: string
  entry: Entry
}

/** The documents a query returns, in Firestore's order. */
function run(spec: QuerySpec): Row[] {
  const rows: Row[] = []
  const { source } = spec
  const cols = source.kind === 'collection' ? [source.path] : [...store.keys()].filter((p) => idOf(p) === source.id)
  for (const colPath of cols) for (const [id, entry] of store.get(colPath) ?? []) rows.push({ path: `${colPath}/${id}`, entry })
  // Without an orderBy, an inequality orders by its field (as Firestore does).
  const orders = [...spec.orders]
  const inequality = spec.filters.find((f) => INEQUALITIES.has(f.op))
  if (inequality && !orders.some((o) => o.field === inequality.field)) orders.unshift({ field: inequality.field, dir: 'asc' })
  const last = orders[orders.length - 1]?.dir ?? 'asc'
  const kept = rows.filter((r) => spec.filters.every((f) => matches(r.entry.data, f)) && orders.every((o) => getField(r.entry.data, o.field) !== undefined))
  kept.sort((a, b) => {
    for (const o of orders) {
      const c = compare(getField(a.entry.data, o.field), getField(b.entry.data, o.field))
      if (c) return o.dir === 'desc' ? -c : c
    }
    const c = compare(a.path, b.path)
    return last === 'desc' ? -c : c
  })
  return spec.limit === null ? kept : kept.slice(0, spec.limit)
}

// --------------------------------------------------------------- snapshots

const METADATA = { hasPendingWrites: false, fromCache: false, isEqual: () => true }

export class DocumentSnapshot {
  readonly ref: DocumentReference
  readonly metadata = METADATA
  private readonly raw: Data | undefined

  constructor(ref: DocumentReference, raw: Data | undefined) {
    this.ref = ref
    this.raw = raw
  }

  get id() {
    return this.ref.id
  }

  exists(): boolean {
    return this.raw !== undefined
  }

  data(): Data | undefined {
    return this.raw === undefined ? undefined : clone(this.raw)
  }

  get(field: string) {
    return clone(getField(this.raw, field))
  }
}

export class QueryDocumentSnapshot extends DocumentSnapshot {
  override data(): Data {
    return super.data()!
  }
}

interface DocChange {
  type: 'added' | 'modified' | 'removed'
  doc: QueryDocumentSnapshot
  oldIndex: number
  newIndex: number
}

export class QuerySnapshot {
  readonly query: Query
  readonly docs: QueryDocumentSnapshot[]
  readonly metadata = METADATA
  private readonly changes: DocChange[]

  constructor(q: Query, docs: QueryDocumentSnapshot[], changes: DocChange[]) {
    this.query = q
    this.docs = docs
    this.changes = changes
  }

  get size() {
    return this.docs.length
  }

  get empty() {
    return this.docs.length === 0
  }

  forEach(cb: (d: QueryDocumentSnapshot) => void) {
    this.docs.forEach(cb)
  }

  docChanges() {
    return this.changes
  }
}

const snapOf = (r: Row) => new QueryDocumentSnapshot(new DocumentReference(r.path), r.entry.data)

export async function getDoc(ref: DocumentReference) {
  await Promise.resolve()
  return new DocumentSnapshot(ref, read(ref.path)?.data)
}

export async function getDocs(q: Query) {
  await Promise.resolve()
  const rows = run(q.spec)
  return new QuerySnapshot(
    q,
    rows.map(snapOf),
    rows.map((r, i) => ({ type: 'added', doc: snapOf(r), oldIndex: -1, newIndex: i })),
  )
}

// --------------------------------------------------------------- listeners

interface Listener {
  target: DocumentReference | Query
  next: (snap: never) => void
  /** Last delivered state: path → version, in order. */
  last: Map<string, number> | null
}

const listeners = new Set<Listener>()
const dirty = new Set<string>()
let flushQueued = false

function deliver(l: Listener) {
  if (l.target instanceof DocumentReference) {
    const entry = read(l.target.path)
    const state = new Map(entry ? [[l.target.path, entry.version]] : [])
    if (l.last && sameState(l.last, state)) return
    l.last = state
    ;(l.next as (s: DocumentSnapshot) => void)(new DocumentSnapshot(l.target, entry?.data))
    return
  }
  const rows = run(l.target.spec)
  const state = new Map(rows.map((r) => [r.path, r.entry.version]))
  if (l.last && sameState(l.last, state)) return
  const before = l.last ? [...l.last.keys()] : []
  const changes: DocChange[] = []
  before.forEach((path, oldIndex) => {
    if (!state.has(path)) changes.push({ type: 'removed', doc: new QueryDocumentSnapshot(new DocumentReference(path), {}), oldIndex, newIndex: -1 })
  })
  rows.forEach((r, newIndex) => {
    const was = l.last?.get(r.path)
    if (was === undefined) changes.push({ type: 'added', doc: snapOf(r), oldIndex: -1, newIndex })
    else if (was !== r.entry.version) changes.push({ type: 'modified', doc: snapOf(r), oldIndex: before.indexOf(r.path), newIndex })
  })
  l.last = state
  ;(l.next as (s: QuerySnapshot) => void)(new QuerySnapshot(l.target, rows.map(snapOf), changes))
}

function sameState(a: Map<string, number>, b: Map<string, number>) {
  if (a.size !== b.size) return false
  const ka = [...a]
  const kb = [...b]
  return ka.every(([p, v], i) => kb[i][0] === p && kb[i][1] === v)
}

function affects(l: Listener, path: string) {
  if (l.target instanceof DocumentReference) return l.target.path === path
  const { source } = l.target.spec
  const col = parentOf(path)
  return source.kind === 'collection' ? source.path === col : idOf(col) === source.id
}

function flush() {
  flushQueued = false
  const paths = [...dirty]
  dirty.clear()
  for (const l of [...listeners]) if (listeners.has(l) && paths.some((p) => affects(l, p))) deliver(l)
}

function changed(paths: string[]) {
  for (const p of paths) dirty.add(p)
  if (!flushQueued) {
    flushQueued = true
    queueMicrotask(flush)
  }
}

type Observer<S> = { next?: (s: S) => void; error?: (e: Error) => void }

export function onSnapshot(target: DocumentReference | Query, ...args: unknown[]): () => void {
  const rest = args.length && typeof args[0] === 'object' && args[0] !== null && !('next' in (args[0] as object)) ? args.slice(1) : args
  const first = rest[0] as ((s: never) => void) | Observer<never>
  const next = typeof first === 'function' ? first : (first?.next ?? (() => undefined))
  const l: Listener = { target, next: next as (s: never) => void, last: null }
  listeners.add(l)
  queueMicrotask(() => listeners.has(l) && deliver(l))
  return () => void listeners.delete(l)
}

// ------------------------------------------------------------------ writes

type Write = { kind: 'set'; path: string; data: Data; merge: boolean } | { kind: 'update'; path: string; data: Data } | { kind: 'delete'; path: string }

class DemoError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function apply(writes: Write[]) {
  // All or nothing, like a batch.
  const staged = new Map<string, Data | undefined>()
  const current = (path: string) => (staged.has(path) ? staged.get(path) : read(path)?.data)
  for (const w of writes) {
    const prev = current(w.path)
    if (w.kind === 'delete') staged.set(w.path, undefined)
    else if (w.kind === 'set') staged.set(w.path, w.merge ? merged(prev, w.data) : (written(w.data, undefined) as Data))
    else {
      if (!prev) throw new DemoError('not-found', `No document to update: ${w.path}`)
      staged.set(w.path, updated(prev, w.data))
    }
  }
  for (const [path, data] of staged) put(path, data)
  changed([...staged.keys()])
}

async function commit(writes: Write[]) {
  apply(writes)
  // Listeners see the change first (latency compensation), then the write resolves.
  await new Promise((r) => setTimeout(r, 0))
}

/** Field/value pairs (`update(ref, 'a', 1, 'b', 2)`) or one object. */
function patchOf(dataOrField: Data | string, more: unknown[]): Data {
  if (typeof dataOrField !== 'string') return dataOrField
  const out: Data = { [dataOrField]: more[0] }
  for (let i = 1; i + 1 < more.length; i += 2) out[more[i] as string] = more[i + 1]
  return out
}

export function setDoc(ref: DocumentReference, data: Data, options?: { merge?: boolean }) {
  return commit([{ kind: 'set', path: ref.path, data, merge: !!options?.merge }])
}

export function updateDoc(ref: DocumentReference, dataOrField: Data | string, ...more: unknown[]) {
  return commit([{ kind: 'update', path: ref.path, data: patchOf(dataOrField, more) }])
}

export function deleteDoc(ref: DocumentReference) {
  return commit([{ kind: 'delete', path: ref.path }])
}

export async function addDoc(col: CollectionReference, data: Data) {
  const ref = doc(col)
  await setDoc(ref, data)
  return ref
}

export class WriteBatch {
  private readonly writes: Write[] = []

  set(ref: DocumentReference, data: Data, options?: { merge?: boolean }) {
    this.writes.push({ kind: 'set', path: ref.path, data, merge: !!options?.merge })
    return this
  }

  update(ref: DocumentReference, dataOrField: Data | string, ...more: unknown[]) {
    this.writes.push({ kind: 'update', path: ref.path, data: patchOf(dataOrField, more) })
    return this
  }

  delete(ref: DocumentReference) {
    this.writes.push({ kind: 'delete', path: ref.path })
    return this
  }

  commit() {
    return commit(this.writes)
  }
}

export function writeBatch(): WriteBatch {
  return new WriteBatch()
}

// -------------------------------------------------------------- demo hooks

/** Loads documents straight into the store (no listeners yet). `Date` values become timestamps. */
export function seed(docs: { path: string; data: Record<string, unknown> }[]) {
  for (const d of docs) put(d.path, written(d.data, undefined) as Data)
}

/** Reads a document's current data (demo code only). */
export function peek(path: string): Data | undefined {
  const data = read(path)?.data
  return data && clone(data)
}

/** The documents of a collection (demo code only). */
export function peekAll(colPath: string): { id: string; data: Data }[] {
  return [...(store.get(colPath) ?? new Map<string, Entry>())].map(([id, e]) => ({ id, data: clone(e.data) }))
}

export { DemoError }
