import { doc, writeBatch } from 'firebase/firestore'
import type { SeedDoc } from '@shared/demo/seed'
import { db } from './firebase'

/** Writes seed documents in batches; Date values become Timestamps. */
export async function writeSeedDocs(docs: SeedDoc[], onProgress?: (done: number, total: number) => void) {
  const size = 400
  for (let i = 0; i < docs.length; i += size) {
    const batch = writeBatch(db)
    for (const d of docs.slice(i, i + size)) batch.set(doc(db, d.path), d.data)
    await batch.commit()
    onProgress?.(Math.min(i + size, docs.length), docs.length)
  }
}
