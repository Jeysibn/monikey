// Transactions store a real ISO (`YYYY-MM-DD`) date so they sort and compare
// correctly; this is the one place that formats it for display, so seed
// data and newly-added transactions always render identically.
export function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
