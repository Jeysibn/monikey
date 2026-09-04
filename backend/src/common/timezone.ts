/**
 * Helper: Get the UTC date corresponding to a local date in a given timezone.
 * Uses binary search to find the exact UTC moment that, when formatted in the
 * target timezone, yields the desired local date/time.
 */
export function getUTCDateForLocalDateTime(
  localYear: number,
  localMonth: number,
  localDay: number,
  localHour: number,
  localMinute: number,
  localSecond: number,
  timezone: string
): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // Binary search: find the UTC timestamp that yields the desired local date
  let low = new Date(Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, localSecond)).getTime() - 24 * 60 * 60 * 1000
  let high = new Date(Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, localSecond)).getTime() + 24 * 60 * 60 * 1000

  while (high - low > 1000) {
    // 1 second tolerance
    const mid = Math.floor((low + high) / 2)
    const testDate = new Date(mid)
    const parts = formatter.formatToParts(testDate)

    const tzYear = parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10)
    const tzMonth = parseInt(parts.find((p) => p.type === 'month')?.value || '0', 10)
    const tzDay = parseInt(parts.find((p) => p.type === 'day')?.value || '0', 10)
    const tzHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
    const tzMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
    const tzSecond = parseInt(parts.find((p) => p.type === 'second')?.value || '0', 10)

    // Compare
    if (tzYear < localYear || (tzYear === localYear && tzMonth < localMonth) || (tzYear === localYear && tzMonth === localMonth && tzDay < localDay) || (tzYear === localYear && tzMonth === localMonth && tzDay === localDay && tzHour < localHour) || (tzYear === localYear && tzMonth === localMonth && tzDay === localDay && tzHour === localHour && tzMinute < localMinute) || (tzYear === localYear && tzMonth === localMonth && tzDay === localDay && tzHour === localHour && tzMinute === localMinute && tzSecond < localSecond)) {
      low = mid
    } else {
      high = mid
    }
  }

  return new Date(Math.round((low + high) / 2))
}
