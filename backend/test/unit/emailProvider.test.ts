import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../../src/config/env.js'
import { createEmailProvider } from '../../src/modules/notifications/email.js'

const baseEnv = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/monikey' }

describe('EmailProvider adapters', () => {
  it('sends Mailpit-compatible JSON by default', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 200 }))
    const provider = createEmailProvider(loadEnv(baseEnv), fetcher)
    await provider.send({ to: 'user@example.com', subject: 'Reminder', text: 'Due soon' })
    expect(fetcher).toHaveBeenCalledWith('http://mailpit:8025/api/v1/send', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toMatchObject({ To: [{ Email: 'user@example.com' }], Subject: 'Reminder', Text: 'Due soon' })
  })

  it('uses Resend only when explicitly configured', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 200 }))
    const env = loadEnv({ ...baseEnv, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key' })
    await createEmailProvider(env, fetcher).send({ to: 'user@example.com', subject: 'Summary', text: 'Totals' })
    expect(fetcher).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) }))
  })

  it('does not call a network provider in stub mode', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await createEmailProvider(loadEnv({ ...baseEnv, EMAIL_PROVIDER: 'stub' }), fetcher).send({ to: 'user@example.com', subject: 'Test', text: 'Ignored' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
