/** Who makes Hyber CRM, where it lives, and the address its emails come from. */
export const PRODUCT_NAME = 'Hyber CRM'
export const COMPANY_NAME = 'HyberTec LLC'
export const APP_URL = 'https://hybercrm.web.app'
export const SENDER_EMAIL = 'hybertecofficial@gmail.com'

/** The sign-in link for a branch; `email` pre-selects that Google account. */
export function branchSignInUrl(branchId: string, email?: string | null, base = APP_URL): string {
  const hint = email ? `&email=${encodeURIComponent(email)}` : ''
  return `${base}/login?next=${encodeURIComponent(`/${branchId}`)}${hint}`
}

export function branchSignupUrl(branchId: string, base = APP_URL): string {
  return `${base}/${branchId}/signup`
}

/** Addresses that never get email (tests and examples). */
export function isReservedEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return !domain || /(^|\.)(test|example|invalid|localhost)$/.test(domain) || /(^|\.)example\.(com|net|org)$/.test(domain)
}
