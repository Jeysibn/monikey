import { useContext, useMemo } from 'react'
import { FinanceContext } from '../state/financeContext'
import * as selectors from '../state/financeSelectors'

/**
 * The single hook pages use to read finance data and perform mutations.
 * Selectors are recomputed with useMemo only when the underlying state
 * changes, keeping derived-calculation logic (in financeSelectors.ts) out
 * of components entirely.
 */
export function useFinance() {
  const ctx = useContext(FinanceContext)
  if (!ctx) throw new Error('useFinance must be used within a FinanceProvider')
  const { state } = ctx

  const derived = useMemo(
    () => ({
      totalAvailableCash: selectors.totalAvailableCash(state),
      totalCreditOwed: selectors.totalCreditOwed(state),
      totalCreditLimit: selectors.totalCreditLimit(state),
      availableCashMonthlyChangePct: selectors.availableCashMonthlyChangePct(state),
      totalIncome: selectors.totalIncome(state),
      totalExpenses: selectors.totalExpenses(state),
      netCashFlow: selectors.netCashFlow(state),
      transferCount: selectors.transferCount(state),
      expensesToday: selectors.expensesToday(state),
      totalBudgetSpent: selectors.totalBudgetSpent(state),
      totalBudgetRemaining: selectors.totalBudgetRemaining(state),
      budgetUsedPct: selectors.budgetUsedPct(state),
      budgetUnallocated: selectors.budgetUnallocated(state),
      budgetSafeCount: selectors.budgetSafeCount(state),
      budgetOnTrackCount: selectors.budgetOnTrackCount(state),
      budgetNearLimitCount: selectors.budgetNearLimitCount(state),
      budgetOverCount: selectors.budgetOverCount(state),
      budgetDaysRemaining: selectors.budgetDaysRemaining(),
      spendMix: selectors.spendMix(state),
      spendMixTotal: selectors.spendMixTotal(state),
      activeGoals: selectors.activeGoals(state),
      completedGoals: selectors.completedGoals(state),
      totalGoalSavings: selectors.totalGoalSavings(state),
      monthlyContributionTotal: selectors.monthlyContributionTotal(state),
      avgGoalProgressPct: selectors.avgGoalProgressPct(state),
      safeToSpendBreakdown: selectors.safeToSpendBreakdown(state),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [state],
  )

  return {
    state,
    ...derived,
    addTransaction: ctx.addTransaction,
    addManualAccount: ctx.addManualAccount,
    addManualCreditCard: ctx.addManualCreditCard,
    addBudgetCategory: ctx.addBudgetCategory,
    createGoal: ctx.createGoal,
    addGoalFunds: ctx.addGoalFunds,
    // Pass-through helpers that need extra args, kept as selectors rather
    // than baked into the memoized object above.
    accountLabel: (accountId?: string) => selectors.accountLabel(state, accountId),
    categoryName: (categoryId?: string) => selectors.categoryName(state, categoryId),
    categoryColor: (categoryId?: string) => selectors.categoryColor(state, categoryId),
    accountDotColor: selectors.accountDotColor,
    transactionAccountLabel: (t: Parameters<typeof selectors.transactionAccountLabel>[1]) =>
      selectors.transactionAccountLabel(state, t),
    expensesTrend: (unit: selectors.ExpensesTrendUnit) => selectors.expensesTrend(state, unit),
    transactionAccountDotColor: selectors.transactionAccountDotColor,
    transferFeeReconciliationLabel: (t: Parameters<typeof selectors.transferFeeReconciliationLabel>[1]) =>
      selectors.transferFeeReconciliationLabel(state, t),
    transactionSourceLabel: selectors.transactionSourceLabel,
    transactionMatchesSearch: (t: Parameters<typeof selectors.transactionMatchesSearch>[1], query: string) =>
      selectors.transactionMatchesSearch(state, t, query),
    budgetStatus: selectors.budgetStatus,
    goalProgressPct: selectors.goalProgressPct,
    goalRawProgressPct: selectors.goalRawProgressPct,
    findAccount: (id?: string) => selectors.findAccount(state, id),
    findCreditCard: (id?: string) => selectors.findCreditCard(state, id),
  }
}
