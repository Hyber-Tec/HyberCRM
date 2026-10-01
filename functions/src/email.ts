import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import nodemailer from 'nodemailer'
import { SENDER_EMAIL } from '@shared/brand'

/**
 * The Google app password of the sending Gmail account (HyberTec's). Set it with
 * `firebase functions:secrets:set GMAIL_APP_PASSWORD`; until then it holds a
 * placeholder and nothing is sent (the invite shows "Email not set up").
 */
export const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD')

export type SendResult = { status: 'sent' } | { status: 'not_configured' } | { status: 'failed'; error: string }

export interface Mail {
  to: string
  subject: string
  html: string
  text: string
  /** Shown as the sender's name, e.g. "Demo Academy via Hyber CRM". */
  fromName: string
  replyTo?: string | null
}

const emulated = process.env.FUNCTIONS_EMULATOR === 'true'

/** Sends one email through Gmail. In the emulator it's written to a local outbox instead. */
export async function sendMail(mail: Mail): Promise<SendResult> {
  if (emulated) {
    const dir = process.env.HYBER_OUTBOX ?? join(tmpdir(), 'hyber-outbox')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${Date.now()}-${mail.to.replace(/[^a-z0-9@.]+/gi, '_')}.html`)
    writeFileSync(file, `<!-- To: ${mail.to} | From: ${mail.fromName} | Reply-To: ${mail.replyTo ?? ''} | Subject: ${mail.subject} -->\n${mail.html}`)
    logger.info(`Email (emulator, not sent) to ${mail.to}: ${mail.subject} → ${file}`)
    return { status: 'sent' }
  }
  // Google shows app passwords as four groups of four letters.
  const pass = (gmailAppPassword.value() ?? '').replace(/\s+/g, '')
  if (!/^[a-z]{16}$/i.test(pass)) return { status: 'not_configured' }
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SENDER_EMAIL, pass } })
  try {
    await transport.sendMail({
      from: { name: mail.fromName, address: SENDER_EMAIL },
      to: mail.to,
      replyTo: mail.replyTo ?? undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })
    return { status: 'sent' }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    logger.error(`Email to ${mail.to} failed`, error)
    // Gmail rejects a wrong or revoked app password with 535.
    return { status: 'failed', error: /535|Invalid login|Username and Password not accepted/i.test(error) ? 'Gmail did not accept the app password.' : error.slice(0, 300) }
  }
}
