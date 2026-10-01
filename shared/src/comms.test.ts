import { describe, expect, it } from 'vitest'
import { announcementCategories, cleanCommentText, isInAudience, notificationMeta, stripHtmlToText } from './comms'

describe('announcements', () => {
  it('turns HTML into searchable text', () => {
    expect(stripHtmlToText('<style>p{}</style><p>Hello&nbsp;<b>tutors</b></p><ul><li>One</li></ul><script>x()</script>')).toBe('Hello tutors One')
    expect(stripHtmlToText('<p>A &amp; B &lt;3</p>')).toBe('A & B <3')
  })

  it('lists defaults first, then used categories A→Z without duplicates', () => {
    expect(announcementCategories(['General', 'Updates'], ['test prep', 'general', 'Policies', '', 'Test Prep'])).toEqual(['General', 'Updates', 'Policies', 'test prep'])
  })

  it('checks the audience', () => {
    expect(isInAudience({ audienceType: 'all', audienceKeys: [] }, 'a@x.test')).toBe(true)
    expect(isInAudience({ audienceType: 'members', audienceKeys: ['a@x.test'] }, 'a@x.test')).toBe(true)
    expect(isInAudience({ audienceType: 'members', audienceKeys: ['b@x.test'] }, 'a@x.test')).toBe(false)
  })

  it('cleans comments like True Education', () => {
    expect(cleanCommentText('  Hi​ there  ')).toBe('Hi there')
  })
})

describe('notifications', () => {
  it('falls back for unknown types', () => {
    expect(notificationMeta('session_no_show').label).toBe('No Show')
    expect(notificationMeta('mystery')).toEqual({ label: 'Notification', color: '#9CA3AF' })
  })
})
