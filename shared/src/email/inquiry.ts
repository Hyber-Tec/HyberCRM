import { APP_URL } from '../brand'
import type { InquiryInput } from '../inquiry'
import type { EmailContent } from './invite'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** To HyberTec: a center asked about Hyber CRM on the landing page (reply goes to them). */
export function inquiryEmail(i: InquiryInput, appUrl = APP_URL): EmailContent {
  const who = i.center ? `${i.name} (${i.center})` : i.name
  const subject = `New inquiry: ${who}`
  const rows: [string, string][] = [
    ['Name', i.name],
    ['Email', i.email],
    ['Center', i.center || '—'],
    ['Phone', i.phone || '—'],
    ['Students', i.students || '—'],
    ['Locations', i.locations || '—'],
  ]
  const text = [
    `${who} asked about Hyber CRM on the website.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    i.message ? `Message:\n${i.message}` : 'No message.',
    '',
    `Reply to this email to answer them. All inquiries: ${appUrl}/platform/inquiries`,
  ].join('\n')
  const cell = 'padding:6px 12px 6px 0;font-size:14px;line-height:20px;vertical-align:top;'
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
<p style="margin:0 0 16px;font-size:16px;line-height:24px;"><strong>${esc(who)}</strong> asked about Hyber CRM on the website.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${rows.map(([k, v]) => `<tr><td style="${cell}color:#71717a;">${esc(k)}</td><td style="${cell}">${esc(v)}</td></tr>`).join('\n')}
</table>
<div style="margin:20px 0 0;padding:16px;border-radius:8px;background:#f4f4f5;font-size:14px;line-height:22px;white-space:pre-wrap;">${i.message ? esc(i.message) : '<span style="color:#71717a;">No message.</span>'}</div>
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#71717a;">Reply to this email to answer them. <a href="${appUrl}/platform/inquiries" style="color:#18181b;">All inquiries</a></p>
</div>
</body>
</html>`
  return { subject, html, text }
}
