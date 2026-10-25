/*
 * Comparing the `created_at` timestamps the API sends (contract B3: ISO 8601 with a UTC offset).
 * PostgreSQL's TIMESTAMPTZ keeps microseconds, but a JavaScript Date keeps only milliseconds, so two entries
 * created within the same millisecond would look equal and fall through to the next tie-break, out of
 * chronological order. This compares whole seconds as instants (offset applied) and then the fraction digit by
 * digit, so no precision is lost, whatever the offset or the number of fractional digits (up to nanoseconds).
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/

interface Instant {
  seconds: number // whole seconds since the epoch, in UTC
  fraction: string // the fractional digits padded to nanoseconds
}

function parse(timestamp: string): Instant | null {
  const m = ISO.exec(timestamp)
  if (!m) return null
  const [, y, mo, d, h, mi, s, frac = '', zone] = m
  let offset = 0
  if (zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1
    offset = sign * (Number(zone.slice(1, 3)) * 3600 + Number(zone.slice(4, 6)) * 60)
  }
  const seconds = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) / 1000 - offset
  return { seconds, fraction: frac.padEnd(9, '0') }
}

/** Negative if `a` is earlier than `b`, positive if later, 0 if the same instant. Unparsable text compares as plain text. */
export function compareTimestamps(a: string, b: string): number {
  const x = parse(a)
  const y = parse(b)
  if (!x || !y) return a < b ? -1 : a > b ? 1 : 0
  if (x.seconds !== y.seconds) return x.seconds < y.seconds ? -1 : 1
  return x.fraction < y.fraction ? -1 : x.fraction > y.fraction ? 1 : 0
}
