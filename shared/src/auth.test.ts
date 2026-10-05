import { describe, expect, it } from 'vitest'
import { accountActionUrl, authErrorMessage, isGoogleMailbox, looksLikeEmail, passwordProblem, passwordStrength, queryParams, signInMethods } from './auth'
import { accountEmail } from './email/account'

describe('passwords', () => {
  it('asks for 8 characters, no padding, not the email', () => {
    expect(passwordProblem('short')).toMatch(/at least 8/)
    expect(passwordProblem(' Tutoring-123')).toMatch(/spaces/)
    expect(passwordProblem('aaaaaaaaa')).toMatch(/repeated/)
    expect(passwordProblem('mayathompson', 'mayathompson@school.org')).toMatch(/email name/)
    expect(passwordProblem('Tutoring-123', 'maya@school.org')).toBeNull()
  })

  it('rates strength from length and variety', () => {
    expect(passwordStrength('abc')).toBe(0)
    expect(passwordStrength('abcdefgh')).toBe(1)
    expect(passwordStrength('Abcdefg1')).toBe(2)
    expect(passwordStrength('Abcdefg1!')).toBe(3)
    expect(passwordStrength('Abcdefg1!xyz')).toBe(4)
  })
})

describe('emails and methods', () => {
  it('recognizes addresses and Gmail mailboxes', () => {
    expect(looksLikeEmail('maya@school.org')).toBe(true)
    expect(looksLikeEmail('maya@school')).toBe(false)
    expect(isGoogleMailbox('Maya@Gmail.com ')).toBe(true)
    expect(isGoogleMailbox('maya@school.org')).toBe(false)
  })

  it('reads how an account signs in', () => {
    expect(signInMethods(['google.com'])).toEqual({ google: true, password: false })
    expect(signInMethods(['password', 'google.com'])).toEqual({ google: true, password: true })
  })

  it('puts Firebase errors in plain words without saying whether an account exists', () => {
    expect(authErrorMessage('auth/invalid-credential')).toBe(authErrorMessage('auth/user-not-found'))
    expect(authErrorMessage('auth/wrong-password', 'change-password')).toMatch(/current password/)
    expect(authErrorMessage('auth/email-already-in-use', 'sign-up')).toMatch(/already an account/)
    expect(authErrorMessage('auth/something-new', 'reset')).toMatch(/send the email/)
  })
})

describe('account emails', () => {
  const link = 'https://hyber-crm.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC123&apiKey=key&continueUrl=x&lang=en'

  it('sends the one-time code to Hyber’s own page, keeping a safe next path only', () => {
    const out = accountActionUrl(link, 'https://hybercrm.com', '/demo-academy')
    expect(out.split('?')[0]).toBe('https://hybercrm.com/auth/action')
    const q = queryParams(out)
    expect(q.get('mode')).toBe('resetPassword')
    expect(q.get('oobCode')).toBe('ABC123')
    expect(q.get('apiKey')).toBeUndefined()
    expect(q.get('next')).toBe('/demo-academy')
    expect(queryParams(accountActionUrl(link, 'https://hybercrm.com', '//evil.example')).get('next')).toBeUndefined()
  })

  it('reads queries without the URL object', () => {
    const q = queryParams('/x?date=2026-10-07&name=Ava%20Patel&flag')
    expect(q.get('date')).toBe('2026-10-07')
    expect(q.get('name')).toBe('Ava Patel')
    expect(q.get('flag')).toBe('')
  })

  it('writes the confirm and reset emails in the invite emails’ voice', () => {
    const v = accountEmail({ kind: 'verify', to: 'maya@school.org', name: 'Maya Thompson', url: 'https://hybercrm.com/auth/action?mode=verifyEmail&oobCode=X' })
    expect(v.subject).toBe('Confirm your email for Hyber CRM')
    expect(v.text).toContain('Hi Maya,')
    expect(v.html).toContain('Confirm my email')
    const r = accountEmail({ kind: 'reset', to: 'maya@school.org', name: '', url: 'https://hybercrm.com/auth/action?mode=resetPassword&oobCode=Y' })
    expect(r.subject).toBe('Reset your Hyber CRM password')
    expect(r.text).toContain('your password stays as it is')
  })
})
