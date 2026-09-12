export type RuleTransaction = { title: string; description?: string | null; merchantName?: string | null; amountMinor: bigint; accountId?: string | null; type: string; source: string; currencyCode: string }
export type RuleConditions = { merchantContains?: string; merchantEquals?: string; titleContains?: string; minAmountMinor?: string; maxAmountMinor?: string; accountId?: string; type?: string; source?: string; currencyCode?: string }
export type RuleActions = { normalizedMerchant?: string; categoryId?: string; addTags?: string[]; note?: string; type?: string }

const contains = (value: string | null | undefined, expected?: string) => expected === undefined || (value ?? '').toLocaleLowerCase().includes(expected.toLocaleLowerCase())
export function matchesRule(tx: RuleTransaction, conditions: RuleConditions): boolean {
  const merchant = tx.merchantName ?? tx.title
  return contains(merchant, conditions.merchantContains) && (!conditions.merchantEquals || merchant.toLocaleLowerCase() === conditions.merchantEquals.toLocaleLowerCase()) && contains(tx.title, conditions.titleContains) && (conditions.minAmountMinor === undefined || tx.amountMinor >= BigInt(conditions.minAmountMinor)) && (conditions.maxAmountMinor === undefined || tx.amountMinor <= BigInt(conditions.maxAmountMinor)) && (!conditions.accountId || tx.accountId === conditions.accountId) && (!conditions.type || tx.type === conditions.type) && (!conditions.source || tx.source === conditions.source) && (!conditions.currencyCode || tx.currencyCode === conditions.currencyCode)
}

export function applyRuleActions(tx: RuleTransaction, actions: RuleActions): RuleTransaction & { tags: string[]; normalizedMerchant?: string; categoryId?: string; note?: string } {
  return { ...tx, normalizedMerchant: actions.normalizedMerchant ?? tx.merchantName ?? undefined, categoryId: actions.categoryId, note: actions.note, type: actions.type ?? tx.type, tags: actions.addTags ?? [] }
}
