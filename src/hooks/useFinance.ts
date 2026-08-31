import { useContext, useMemo } from 'react'
import { FinanceContext } from '../state/financeContext'
import * as selectors from '../state/financeSelectors'
import { formatPeriodLabel } from '../utils/date'
import { maxFundableAmount } from '../domain/financeRules'

/**
 * The single hook pages use to read finance data and perform mutations.
 * Selectors are recomputed with useMemo only when the underlying state (or
 * the clock's `todayIso`) changes, keeping derived-calculation logic (in
 * financeSelectors.ts) out of components entirely.
 *
 * TR-001: `todayIso` and `activePeriod` come from the provider's injected
 * clock and are passed into every time-dependent selector here — no
 * component or selector calls `new Date()` for itself.
 */
export function useFinance() {
  const ctx = useContext(FinanceContext)
  if (!ctx) throw new Error('useFinance must be used within a FinanceProvider')
  const { state, todayIso } = ctx

  const derived = useMemo(() => {
    const activePeriod = selectors.activeReportingPeriod(todayIso)
    return {
      todayIso,
      activePeriod,
      /** e.g. "August 2026" — the reporting window every period-scoped KPI is labeled with. */
      activePeriodLabel: formatPeriodLabel(activePeriod),
      totalAvailableCash: selectors.totalAvailableCash(state),
      totalCreditOwed: selectors.totalCreditOwed(state),
      totalCreditLimit: selectors.totalCreditLimit(state),
      availableCashMonthlyChangePct: selectors.availableCashMonthlyChangePct(state),
      totalIncome: selectors.totalIncome(state, activePeriod),
      totalExpenses: selectors.totalExpenses(state, activePeriod),
      netCashFlow: selectors.netCashFlow(state, activePeriod),
      transferCount: selectors.transferCount(state, activePeriod),
      expensesToday: selectors.expensesToday(state, todayIso),
      totalBudgetSpent: selectors.totalBudgetSpent(state),
      totalBudgetRemaining: selectors.totalBudgetRemaining(state),
      budgetUsedPct: selectors.budgetUsedPct(state),
      budgetUnallocated: selectors.budgetUnallocated(state),
      budgetSafeCount: selectors.budgetSafeCount(state),
      budgetOnTrackCount: selectors.budgetOnTrackCount(state),
      budgetNearLimitCount: selectors.budgetNearLimitCount(state),
      budgetOverCount: selectors.budgetOverCount(state),
      budgetDaysRemaining: selectors.budgetDaysRemaining(todayIso, activePeriod),
      spendMix: selectors.spendMix(state),
      spendMixTotal: selectors.spendMixTotal(state),
      activeGoals: selectors.activeGoals(state),
      completedGoals: selectors.completedGoals(state),
      totalGoalSavings: selectors.totalGoalSavings(state),
      plannedMonthlyContributionTotal: selectors.plannedMonthlyContributionTotal(state),
      avgGoalProgressPct: selectors.avgGoalProgressPct(state),
      safeToSpendBreakdown: selectors.safeToSpendBreakdown(state, todayIso),
    }
  }, [state, todayIso])

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
    isCreditCardId: (id?: string) => selectors.isCreditCardId(state, id),
    maxFundableAmount: (goalId: string, sourceAccountId: string) => maxFundableAmount(state, goalId, sourceAccountId),
    transactionAccountLabel: (t: Parameters<typeof selectors.transactionAccountLabel>[1]) =>
      selectors.transactionAccountLabel(state, t),
    expensesTrend: (unit: selectors.ExpensesTrendUnit) => selectors.expensesTrend(state, unit, todayIso),
    expensesTrendTitle: selectors.expensesTrendTitle,
    expensesTrendRangeLabel: selectors.expensesTrendRangeLabel,
    transactionAccountDotColor: selectors.transactionAccountDotColor,
    transferFeeReconciliationLabel: (t: Parameters<typeof selectors.transferFeeReconciliationLabel>[1]) =>
      selectors.transferFeeReconciliationLabel(state, t),
    cardPaymentReconciliationLabel: (t: Parameters<typeof selectors.cardPaymentReconciliationLabel>[1]) =>
      selectors.cardPaymentReconciliationLabel(state, t),
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
