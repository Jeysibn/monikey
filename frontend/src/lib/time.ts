/** "09:14": the hour and minute in the person's own time zone, 24-hour, for "Last updated 09:14". */
export function formatClock(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getHours())}:${two(date.getMinutes())}`
}
