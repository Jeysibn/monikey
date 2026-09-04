import type { Env } from '../../config/env.js'

export interface EmailMessage { to: string; subject: string; text: string }
export interface EmailProvider { send(message: EmailMessage): Promise<void> }

export function createEmailProvider(env: Env, fetcher: typeof fetch = fetch): EmailProvider {
  if (env.EMAIL_PROVIDER === 'stub') return { async send() {} }
  if (env.EMAIL_PROVIDER === 'resend') {
    return { async send(message) {
      if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend')
      const response = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text }) })
      if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`)
    } }
  }
  return { async send(message) {
    const response = await fetcher(env.MAILPIT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ From: { Email: env.EMAIL_FROM }, To: [{ Email: message.to }], Subject: message.subject, Text: message.text }) })
    if (!response.ok) throw new Error(`Mailpit returned HTTP ${response.status}`)
  } }
}
