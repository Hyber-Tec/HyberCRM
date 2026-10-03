/**
 * Stand-in for `firebase/storage` in the demo build: uploads stay in this tab
 * as object URLs (a logo or an announcement image shows up, then disappears on reload).
 */

interface StorageRef {
  fullPath: string
  name: string
}

const files = new Map<string, string>()

export function getStorage() {
  return {}
}

export function connectStorageEmulator() {}

export function ref(_storage: unknown, path = ''): StorageRef {
  return { fullPath: path, name: path.split('/').pop() ?? '' }
}

export async function uploadBytes(r: StorageRef, data: Blob) {
  const old = files.get(r.fullPath)
  if (old) URL.revokeObjectURL(old)
  files.set(r.fullPath, URL.createObjectURL(data))
  return { ref: r, metadata: { fullPath: r.fullPath, size: data.size, contentType: data.type } }
}

export async function getDownloadURL(r: StorageRef) {
  const url = files.get(r.fullPath)
  if (!url) throw Object.assign(new Error('File not found.'), { code: 'storage/object-not-found' })
  return url
}

export async function deleteObject(r: StorageRef) {
  const url = files.get(r.fullPath)
  if (url) URL.revokeObjectURL(url)
  files.delete(r.fullPath)
}
