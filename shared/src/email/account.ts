import type { AccountEmailKind } from '../auth'
import { APP_URL, COMPANY_NAME, PRODUCT_NAME } from '../brand'
import type { EmailContent } from './invite'

export interface AccountEmailInput {
  kind: AccountEmailKind
  to: string
  /** The person's name, if known. */
  name: string
  /** Hyber's own page with the one-time code (`accountActionUrl`). */
  url: string
  appUrl?: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function copy(i: AccountEmailInput) {
  const first = i.name.trim().split(/\s+/)[0] ?? ''
  const greeting = first ? `Hi ${first},` : 'Hi,'
  if (i.kind === 'verify') {
    return {
      subject: `Confirm your email for ${PRODUCT_NAME}`,
      title: 'Confirm your email',
      greeting,
      intro: `Tap the button to confirm that ${i.to} is yours. Then you can sign in to ${PRODUCT_NAME} with it.`,
      button: 'Confirm my email',
      why: `You’re getting this because someone created a ${PRODUCT_NAME} account with ${i.to}. If it wasn’t you, ignore this email: the account can’t be used without this link.`,
    }
  }
  return {
    subject: `Reset your ${PRODUCT_NAME} password`,
    title: 'Reset your password',
    greeting,
    intro: `Tap the button to choose a new password for ${i.to}. The link works once and expires in an hour.`,
    button: 'Choose a new password',
    why: `You’re getting this because someone asked to reset the password for ${i.to}. If it wasn’t you, ignore this email: your password stays as it is.`,
  }
}

/** "Confirm your email" and "Reset your password", in the look of the invite emails. */
export function accountEmail(i: AccountEmailInput): EmailContent {
  const appUrl = i.appUrl ?? APP_URL
  const c = copy(i)
  const text = [
    c.greeting,
    '',
    c.intro,
    '',
    `${c.button}: ${i.url}`,
    '',
    '—',
    c.why,
    `${PRODUCT_NAME} is software by ${COMPANY_NAME}. ${appUrl}`,
  ].join('\n')

  const p = 'margin:0 0 16px;font-size:15px;line-height:24px;color:#3f3f46;'
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="padding:0 4px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><img src="${esc(appUrl)}/brand/hybercrm-email.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px;"></td>
<td style="vertical-align:middle;padding-left:10px;font-size:16px;font-weight:600;color:#18181b;">${esc(PRODUCT_NAME)}</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
<h1 style="margin:0 0 20px;font-size:22px;line-height:30px;font-weight:600;color:#18181b;">${esc(c.title)}</h1>
<p style="${p}">${esc(c.greeting)}</p>
<p style="${p}">${esc(c.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="border-radius:10px;background:#18181b;"><a href="${esc(i.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(c.button)}</a></td>
</tr></table>
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#71717a;">Button not working? Paste this link into your browser:<br><a href="${esc(i.url)}" style="color:#52525b;word-break:break-all;">${esc(i.url)}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#71717a;">
<p style="margin:0 0 8px;">${esc(c.why)}</p>
<p style="margin:0;">${esc(PRODUCT_NAME)} is software by ${esc(COMPANY_NAME)}. <a href="${esc(appUrl)}" style="color:#71717a;">${esc(appUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject: c.subject, text, html }
}
