import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

let hooked = false

/** Announcement HTML is sanitized when saved and again when shown. Links open in a new tab. */
export function sanitizeHtml(html: string): string {
  if (!hooked) {
    hooked = true
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && node.getAttribute('href')) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer nofollow')
      }
    })
  }
  return DOMPurify.sanitize(html ?? '', {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style'],
  })
}

/** True when the editor HTML has visible text or an image. */
export function hasContent(html: string): boolean {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')
  return (doc.body.textContent ?? '').replace(/[\s​ ]/g, '') !== '' || doc.body.querySelector('img') !== null
}

export function HtmlContent({ html, className }: { html: string; className?: string }) {
  return <div className={cn('rich-content', className)} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
}
