/**
 * The subject list every branch starts with: 125 subjects in 7 categories, in
 * display order. Each branch gets its own copy (stable IDs from `subjectSlug`)
 * and can add, rename, move or delete subjects freely. A tutor's subjects are
 * informational: they never block booking a session.
 */
export const DEFAULT_SUBJECT_CATALOG: readonly { category: string; subjects: readonly string[] }[] = [
  {
    category: 'Math',
    subjects: [
      'Middle School Math', 'High School Math', 'Pre-Algebra', 'Algebra 1', 'Algebra 2', 'Geometry', 'Precalculus', 'AP Precalculus', 'Calculus',
      'AP Calculus AB', 'AP Calculus BC', 'Statistics', 'AP Statistics', 'PSAT Math', 'SAT Math', 'ACT Math', 'Elementary Math',
    ],
  },
  {
    category: 'English & Literature',
    subjects: [
      'Elementary English', 'Middle School English', 'High School English', 'American Literature and Composition',
      'British Literature and Composition', 'World Literature and Composition', 'Literature and Composition',
      'AP English Language and Composition', 'AP English Literature and Composition', 'AP Seminar', 'PSAT R/W', 'SAT R/W', 'ACT Reading',
      'ACT English',
    ],
  },
  {
    category: 'Science',
    subjects: [
      'Elementary Science', 'Middle School Science', 'Physical Science', 'Biology', 'Honors Biology', 'AP Biology', 'Ecology', 'Chemistry',
      'Organic Chemistry', 'AP Chemistry', 'Physics', 'AP Physics 1: Algebra-Based', 'AP Physics 2: Algebra-Based', 'AP Physics C: Mechanics',
      'AP Physics C: Electricity and Magnetism', 'Environmental Science', 'AP Environmental Science', 'Computer Science',
      'AP Computer Science Principles', 'AP Computer Science A', 'IB Physics', 'IB Biology', 'IB Chemistry',
      'IB Environmental Systems and Societies', 'ACT Science',
    ],
  },
  {
    category: 'History & Social Studies',
    subjects: [
      'Elementary Social Studies', 'Middle School Social Studies', 'World History', 'AP World History', 'US History', 'AP US History',
      'Microeconomics', 'AP Microeconomics', 'Macroeconomics', 'AP Macroeconomics', 'US Government and Politics', 'AP US Government and Politics',
      'AP Comparative Government and Politics', 'Human Geography', 'AP Human Geography', 'Psychology', 'AP Psychology', 'Sociology', 'Philosophy',
      'European History', 'African History', 'AP African American Studies', 'IB History', 'AP European History', 'IB Economics', 'IB Psychology',
    ],
  },
  {
    category: 'Test Preparation',
    subjects: [
      'GRE Prep', 'GMAT Prep', 'MCAT Prep', 'SSAT', 'ISEE',
    ],
  },
  {
    category: 'World Languages',
    subjects: [
      'Spanish 1', 'Spanish 2', 'Spanish 3', 'Spanish 4', 'AP Spanish Language and Culture', 'AP Spanish Literature and Culture', 'IB Spanish',
      'French 1', 'French 2', 'French 3', 'French 4', 'AP French Language and Culture', 'IB French', 'German 1', 'German 2', 'German 3',
      'German 4', 'AP German Language and Culture', 'IB German', 'Latin 1', 'Latin 2', 'Latin 3', 'Latin 4', 'AP Latin', 'Korean 1', 'Korean 2',
      'Korean 3', 'Korean 4', 'Chinese 1', 'Chinese 2', 'Chinese 3', 'Chinese 4', 'AP Chinese Language and Culture',
    ],
  },
  {
    category: 'Arts & Music',
    subjects: [
      'AP Art History', 'AP 2-D Art and Design', 'AP 3-D Art and Design', 'AP Drawing', 'AP Music Theory',
    ],
  },
]

/** "AP Physics 1: Algebra-Based" → "ap-physics-1-algebra-based": stable IDs for catalog documents. */
export function subjectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface DefaultCatalogDocs {
  categories: { id: string; name: string; order: number }[]
  subjects: { id: string; name: string; categoryId: string; order: number }[]
}

/** The default catalog as category and subject documents (IDs, names, order). */
export function defaultSubjectDocs(): DefaultCatalogDocs {
  const categories: DefaultCatalogDocs['categories'] = []
  const subjects: DefaultCatalogDocs['subjects'] = []
  DEFAULT_SUBJECT_CATALOG.forEach((c, ci) => {
    const categoryId = subjectSlug(c.category)
    categories.push({ id: categoryId, name: c.category, order: ci })
    c.subjects.forEach((name, order) => subjects.push({ id: subjectSlug(name), name, categoryId, order }))
  })
  return { categories, subjects }
}

/** Subjects in catalog order: by their category's order, then their own, then name. */
export function sortSubjects<T extends { categoryId: string; order: number; name: string }>(
  subjects: readonly T[],
  categories: readonly { id: string; order: number }[],
): T[] {
  const rank = new Map(categories.map((c) => [c.id, c.order]))
  const big = Number.MAX_SAFE_INTEGER
  return [...subjects].sort((a, b) => (rank.get(a.categoryId) ?? big) - (rank.get(b.categoryId) ?? big) || a.order - b.order || a.name.localeCompare(b.name))
}
