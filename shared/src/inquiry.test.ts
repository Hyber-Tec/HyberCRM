import { describe, expect, it } from 'vitest'
import { type InquiryInput, inquiryError, readInquiry } from './inquiry'

const ok: InquiryInput = { name: 'Jordan Lee', email: 'Jordan@Center.com ', center: 'Northside', phone: '', students: '50–150', locations: '1', message: 'Hi' }

describe('inquiries', () => {
  it('accepts a complete request and cleans it', () => {
    expect(readInquiry(ok)).toEqual({ ...ok, email: 'jordan@center.com' })
  })

  it('needs a name and a valid email', () => {
    expect(readInquiry({ ...ok, name: '  ' })).toEqual({ error: 'Please tell us your name.' })
    expect(readInquiry({ ...ok, email: 'not-an-email' })).toEqual({ error: 'That email doesn’t look right.' })
    expect(readInquiry({ ...ok, email: '' })).toEqual({ error: 'Please enter your email so we can reply.' })
  })

  it('only takes the listed sizes and keeps fields short', () => {
    expect(inquiryError({ ...ok, students: 'lots' as never })).toBe('Choose how many students you have.')
    expect(inquiryError({ ...ok, message: 'x'.repeat(2001) })).toBe('One of the fields is too long.')
    expect(inquiryError({ ...ok, students: '', locations: '' })).toBeNull()
  })

  it('ignores anything that is not a string', () => {
    expect(readInquiry({ ...ok, phone: 12345, extra: true })).toEqual({ ...ok, email: 'jordan@center.com', phone: '' })
    expect(readInquiry(null)).toEqual({ error: 'Please tell us your name.' })
  })
})
