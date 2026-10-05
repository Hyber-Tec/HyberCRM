import { APP_URL, COMPANY_NAME, PRODUCT_NAME } from '../brand'
import type { EmailContent } from './invite'

export interface ReportEmailInput {
  to: string
  /** The parent's (or student's) name, if known. */
  name: string
  studentFirstName: string
  branchName: string
  periodLabel: string
  sessions: number
  hours: number
  /** Sign-in link that opens the report. */
  url: string
  contact: { phone: string; email: string }
  /** The recipient is the student. */
  forStudent?: boolean
  appUrl?: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * "Ava's progress report is ready": only the link and a one-line summary, never
 * the report's content (privacy; DECISIONS §5).
 */
export function reportEmail(i: ReportEmailInput): EmailContent {
  const appUrl = i.appUrl ?? APP_URL
  const first = i.name.trim().split(/\s+/)[0] ?? ''
  const whose = i.forStudent ? 'Your' : `${i.studentFirstName}’s`
  const subject = i.forStudent ? `Your progress report from ${i.branchName} is ready` : `${i.studentFirstName}’s progress report from ${i.branchName} is ready`
  const intro = `${i.branchName} has shared ${whose.toLowerCase() === 'your' ? 'your' : whose} progress report for ${i.periodLabel}.`
  const summary = `${i.sessions} session${i.sessions === 1 ? '' : 's'} · ${i.hours} hour${i.hours === 1 ? '' : 's'} of tutoring`
  const contactLine = [i.contact.phone, i.contact.email].filter(Boolean).join(' · ')
  const text = [
    first ? `Hi ${first},` : 'Hi,',
    '',
    intro,
    summary,
    '',
    `View the report: ${i.url}`,
    `You’ll sign in with ${i.to}, with Google or your password.`,
    '',
    ...(contactLine ? [`Questions? Contact ${i.branchName}: ${contactLine}`, ''] : []),
    '—',
    `${PRODUCT_NAME} is software by ${COMPANY_NAME}. ${appUrl}`,
  ].join('\n')

  const p = 'margin:0 0 16px;font-size:15px;line-height:24px;color:#3f3f46;'
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="padding:0 4px 20px;font-size:16px;font-weight:600;color:#18181b;">${esc(i.branchName)}</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
<h1 style="margin:0 0 20px;font-size:22px;line-height:30px;font-weight:600;color:#18181b;">${esc(whose)} progress report is ready</h1>
<p style="${p}">${esc(first ? `Hi ${first},` : 'Hi,')}</p>
<p style="${p}">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #f4f4f5;border-radius:12px;margin:0 0 8px;">
<tr><td style="padding:14px 18px;font-size:14px;line-height:22px;color:#3f3f46;">${esc(summary)}</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="border-radius:10px;background:#18181b;"><a href="${esc(i.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">View the report</a></td>
</tr></table>
<p style="margin:0;font-size:14px;line-height:22px;color:#52525b;">You’ll sign in with <strong>${esc(i.to)}</strong>, with Google or your password.</p>
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#71717a;">Button not working? Paste this link into your browser:<br><a href="${esc(i.url)}" style="color:#52525b;word-break:break-all;">${esc(i.url)}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#71717a;">
${contactLine ? `<p style="margin:0 0 8px;">Questions about this report? Contact ${esc(i.branchName)}: ${esc(contactLine)}</p>` : ''}
<p style="margin:0;">${esc(PRODUCT_NAME)} is software by ${esc(COMPANY_NAME)}. <a href="${esc(appUrl)}" style="color:#71717a;">${esc(appUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  return { subject, text, html }
}
