export type RecurringCandidateInput = { title: string; amountMinor: bigint; occurredOn: Date }
export type RecurringCandidate = { merchant: string; amountMinor: string; frequency: 'monthly'; occurrences: number; explanation: string }

/** Deterministic suggestion heuristic: exact merchant/amount repeats roughly monthly. */
export function detectMonthlyCandidates(rows: RecurringCandidateInput[]): RecurringCandidate[] {
  const groups = new Map<string, RecurringCandidateInput[]>()
  for (const row of rows) { const key = `${row.title.trim().toLocaleLowerCase()}|${row.amountMinor}`; groups.set(key, [...(groups.get(key) ?? []), row]) }
  const candidates: RecurringCandidate[] = []
  for (const group of groups.values()) {
    group.sort((a, b) => a.occurredOn.getTime() - b.occurredOn.getTime())
    if (group.length < 3) continue
    const intervals = group.slice(1).map((row, i) => Math.round((row.occurredOn.getTime() - group[i]!.occurredOn.getTime()) / 86_400_000))
    if (intervals.every((days) => days >= 25 && days <= 35)) candidates.push({ merchant: group[0]!.title, amountMinor: group[0]!.amountMinor.toString(), frequency: 'monthly', occurrences: group.length, explanation: `Appears ${group.length} times at the same amount, roughly monthly.` })
  }
  return candidates.sort((a, b) => b.occurrences - a.occurrences || a.merchant.localeCompare(b.merchant))
}
