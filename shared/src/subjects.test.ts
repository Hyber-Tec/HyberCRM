import { describe, expect, it } from 'vitest'
import { DEFAULT_SUBJECT_CATALOG, defaultSubjectDocs, sortSubjects, subjectSlug } from './subjects'

describe('default subject catalog', () => {
  it('has 125 subjects in 7 categories with unique IDs', () => {
    const { categories, subjects } = defaultSubjectDocs()
    expect(categories.map((c) => c.name)).toEqual(['Math', 'English & Literature', 'Science', 'History & Social Studies', 'Test Preparation', 'World Languages', 'Arts & Music'])
    expect(subjects).toHaveLength(125)
    expect(new Set(subjects.map((s) => s.id)).size).toBe(125)
    expect(new Set(categories.map((c) => c.id)).size).toBe(7)
    expect(subjects.find((s) => s.name === 'SAT R/W')).toMatchObject({ id: 'sat-r-w', categoryId: 'english-literature' })
  })

  it('keeps each category’s order from 0', () => {
    const { subjects } = defaultSubjectDocs()
    for (const c of DEFAULT_SUBJECT_CATALOG) {
      const inCat = subjects.filter((s) => s.categoryId === subjectSlug(c.category))
      expect(inCat.map((s) => s.order)).toEqual(inCat.map((_, i) => i))
    }
  })

  it('makes readable slugs', () => {
    expect(subjectSlug('AP Physics 1: Algebra-Based')).toBe('ap-physics-1-algebra-based')
    expect(subjectSlug('Arts & Music')).toBe('arts-music')
  })

  it('sorts subjects by category, then order', () => {
    const cats = [{ id: 'b', order: 0 }, { id: 'a', order: 1 }]
    const list = [
      { name: 'Z', categoryId: 'a', order: 0 },
      { name: 'Y', categoryId: 'b', order: 1 },
      { name: 'X', categoryId: 'b', order: 0 },
      { name: 'W', categoryId: 'missing', order: 0 },
    ]
    expect(sortSubjects(list, cats).map((s) => s.name)).toEqual(['X', 'Y', 'Z', 'W'])
  })
})
