import { DEFAULT_SETTINGS, type BranchSettings } from './defaults'

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> | null }
    : T

export type SettingsOverrides = DeepPartial<BranchSettings>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

/**
 * Deep-merges `override` onto `base`. Plain objects merge key by key; arrays and
 * primitives replace; `undefined` is ignored; `null` replaces only when the base
 * value is not an object (nullable settings), otherwise it means "use the default".
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(override)) {
    if (override === null && isPlainObject(base)) return base
    return override as T
  }
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    out[key] = key in base ? deepMerge((base as Record<string, unknown>)[key], value) : value
  }
  return out as T
}

export function resolveSettings(overrides: SettingsOverrides | null | undefined): BranchSettings {
  return deepMerge(DEFAULT_SETTINGS, overrides ?? {})
}

/** Reads a dotted path ("schedule.autoConfirm.hoursBefore") from an object. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (!isPlainObject(cur)) return undefined
    cur = cur[part]
  }
  return cur
}

/** Returns a copy of `obj` with `path` set to `value` (creating plain objects on the way). */
export function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.')
  const root: Record<string, unknown> = { ...(obj as Record<string, unknown>) }
  let cur = root
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]]
    cur[parts[i]] = isPlainObject(next) ? { ...next } : {}
    cur = cur[parts[i]] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
  return root as T
}

/** Removes `path` from a copy of `obj` and prunes empty parent objects. */
export function unsetPath<T extends object>(obj: T, path: string): T {
  const parts = path.split('.')
  const root: Record<string, unknown> = { ...(obj as Record<string, unknown>) }
  const stack: Record<string, unknown>[] = [root]
  let cur = root
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]]
    if (!isPlainObject(next)) return root as T
    cur[parts[i]] = { ...next }
    cur = cur[parts[i]] as Record<string, unknown>
    stack.push(cur)
  }
  delete cur[parts[parts.length - 1]]
  for (let i = parts.length - 2; i >= 0; i--) {
    const child = stack[i + 1]
    if (Object.keys(child).length === 0) delete stack[i][parts[i]]
  }
  return root as T
}
