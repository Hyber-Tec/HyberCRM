/** Branch IDs are URL slugs (`/demo-academy/admin`), so they may not collide with app routes. */
export const RESERVED_BRANCH_IDS: ReadonlySet<string> = new Set([
  'app', 'login', 'logout', 'signup', 'sign-up', 'register', 'platform', 'admin', 'tutor', 'parent',
  'student', 'kiosk', 'api', 'assets', 'static', 'public', 'no-access', 'select', 'branches', 'b',
  'www', 'help', 'docs', 'support', 'settings', 'account', 'auth', 'hyber', 'hyber-crm', 'index',
  'manifest', 'service-worker', 'sw', 'robots', 'favicon', 'icons', 'images', 'brand',
  // The website's own pages (the landing page lives at `/`).
  'demo', 'landing', 'sitemap', 'og', 'pricing', 'features', 'contact', 'about', 'blog', 'privacy', 'terms',
])

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

/** Returns an error message, or null when the ID is valid. */
export function validateBranchId(id: string): string | null {
  if (!id) return 'Enter an ID.'
  if (id.length < 3 || id.length > 40) return 'Use 3 to 40 characters.'
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(id)) {
    return 'Use lowercase letters, numbers and hyphens; start with a letter and end with a letter or number.'
  }
  if (id.includes('--')) return 'Don’t use two hyphens in a row.'
  if (RESERVED_BRANCH_IDS.has(id)) return 'This ID is reserved. Choose another one.'
  return null
}
