/**
 * Shared reporting semantics for ledger transactions.
 *
 * Reversing a transaction posts a compensating transaction of the same type and
 * links the pair to each other via `reversedTransactionId`. Both rows stay in the
 * ledger for audit and both keep their balance effects (which net to zero), so
 * reporting must treat the pair as a single no-op: spending/income aggregations
 * exclude every row that is part of a reversal pair.
 *
 * A genuine refund is a separate, independent income transaction with no
 * `reversedTransactionId`, so it is still reported.
 *
 * Spread this into the `where` of any income/expense reporting query. It must
 * NOT be applied to balance-effect queries (account balances, reconciliation).
 */
export const excludeReversalPairs = { reversedTransactionId: null } as const
