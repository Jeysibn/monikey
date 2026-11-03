/** "09:14": the hour and minute in the person's own time zone, 24-hour, for "Last updated 09:14". */
export function formatClock(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getHours())}:${two(date.getMinutes())}`
}

/** "Oct 24, 2026, 9:00 PM" in Manila time, for when a reflection was saved. */
export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
