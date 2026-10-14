import { randomInt } from 'node:crypto'

/**
 * A distinct client address per spec run. The API trusts X-Forwarded-For only from loopback/private proxies (see backend app.ts `trustProxy`),
 * so each spec gets its own per-IP rate-limit bucket and the production limits stay exactly as configured: no limiter reset, no bypass.
 */
export const isolatedClient = (): Record<string, string> => ({ 'X-Forwarded-For': `100.${randomInt(64, 128)}.${randomInt(0, 256)}.${randomInt(1, 255)}` })
