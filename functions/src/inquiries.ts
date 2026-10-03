import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { SENDER_EMAIL } from '@shared/brand'
import { inquiryEmail } from '@shared/email/inquiry'
import { readInquiry } from '@shared/inquiry'
import { ROOT } from '@shared/paths'
import { db } from './app'
import { gmailAppPassword, sendMail } from './email'

/** Requests per address per hour (kept by each running instance). */
const PER_HOUR = 5
const recent = new Map<string, number[]>()

/**
 * The landing page's "Talk to us" form (`POST /api/inquiry`, a Hosting rewrite):
 * stores the request in `inquiries` for the Super Admin (Platform → Inquiries)
 * and emails it to HyberTec, with the visitor as the reply-to address.
 */
export const submitInquiry = onRequest({ secrets: [gmailAppPassword], maxInstances: 2, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' })
    return
  }
  const body = (typeof req.body === 'object' && req.body) || {}
  // Bots fill in the hidden field, or send the form the moment it loads: they're told it worked.
  if (body.website || Number(body.ms) < 2500) {
    res.json({ ok: true })
    return
  }
  const input = readInquiry(body)
  if ('error' in input) {
    res.status(400).json({ error: input.error })
    return
  }
  const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '')
    .split(',')[0]
    .trim()
  const from = createHash('sha256').update(`hyber-inquiry:${ip}`).digest('hex').slice(0, 16)
  const now = Date.now()
  const times = (recent.get(from) ?? []).filter((t) => now - t < 3_600_000)
  // (Not in the emulator, where the tests send many.)
  if (times.length >= PER_HOUR && process.env.FUNCTIONS_EMULATOR !== 'true') {
    res.status(429).json({ error: `That’s a lot of messages. Please email us at ${SENDER_EMAIL}.` })
    return
  }
  recent.set(from, [...times, now])

  const ref = db.collection(ROOT.inquiries).doc()
  await ref.set({ ...input, status: 'new', createdAt: FieldValue.serverTimestamp(), from, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300), notify: null })
  const mail = inquiryEmail(input)
  const sent = await sendMail({ to: SENDER_EMAIL, subject: mail.subject, html: mail.html, text: mail.text, fromName: 'Hyber CRM website', replyTo: input.email })
  await ref.update({ notify: { status: sent.status, at: FieldValue.serverTimestamp(), error: sent.status === 'failed' ? sent.error : null } })
  logger.info(`Inquiry ${ref.id} from ${input.email}: email ${sent.status}`)
  res.json({ ok: true })
})
