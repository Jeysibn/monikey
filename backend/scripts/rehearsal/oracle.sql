-- Stage 7B independent financial oracle. READ-ONLY (SELECT only). Uses only columns that exist in the legacy baseline,
-- so the identical file runs before and after migration. Re-derives balances from transaction rows (not from stored
-- balance effects) and reports hashes of every financial column so any silent mutation is visible.
\set QUIET on
\pset format unaligned
\pset tuples_only on
SET default_transaction_read_only = on;
WITH
tx AS (SELECT * FROM transactions),
-- a row is "voided" when it is a reversed original or the compensating reversal row
voided AS (SELECT id FROM tx WHERE reversed_transaction_id IS NOT NULL),
derived AS (
  SELECT a.id, a.user_id, a.name, a.account_type, a.classification, a.archived_at IS NOT NULL AS archived,
         a.opening_balance_minor AS opening, a.current_balance_minor AS stored,
         a.opening_balance_minor + COALESCE((
           SELECT sum((CASE WHEN t.reversed_transaction_id IS NOT NULL AND t.title LIKE 'Reversal: %' THEN -1 ELSE 1 END) * CASE
             WHEN t.type='expense' AND t.from_account_id=a.id THEN CASE WHEN a.account_type='credit_card' THEN t.amount_minor ELSE -t.amount_minor END
             WHEN t.type='income'  AND t.to_account_id=a.id   THEN t.amount_minor
             WHEN t.type='transfer' AND t.from_account_id=a.id THEN -t.amount_minor
             WHEN t.type='transfer' AND t.to_account_id=a.id   THEN CASE WHEN a.account_type='credit_card' THEN -t.amount_minor ELSE t.amount_minor END
             ELSE 0 END)
           FROM tx t),0) AS from_transactions,
         a.opening_balance_minor + COALESCE((SELECT sum(e.delta_minor) FROM transaction_balance_effects e WHERE e.account_id=a.id),0) AS from_effects
  FROM financial_accounts a),
position AS (
  SELECT user_id,
    sum(CASE WHEN classification='asset' AND NOT archived THEN stored ELSE 0 END) AS liquid_assets,
    sum(CASE WHEN account_type='credit_card' THEN stored ELSE 0 END) AS card_debt
  FROM derived GROUP BY user_id),
spend AS (  -- expenses and income exclude transfers/card repayments and both halves of every reversal
  SELECT user_id, to_char(occurred_on,'YYYY-MM') AS month, category_id,
         sum(CASE WHEN type='expense' THEN amount_minor ELSE 0 END) AS expense,
         sum(CASE WHEN type='income' THEN amount_minor ELSE 0 END) AS income
  FROM tx WHERE type IN ('expense','income') AND status='cleared' AND id NOT IN (SELECT id FROM voided) AND reversed_transaction_id IS NULL
  GROUP BY 1,2,3)
SELECT jsonb_pretty(jsonb_build_object(
  'counts', jsonb_build_object(
    'users',(SELECT count(*) FROM users),'accounts',(SELECT count(*) FROM financial_accounts),
    'cards',(SELECT count(*) FROM credit_card_details),'categories',(SELECT count(*) FROM categories),
    'transactions',(SELECT count(*) FROM tx),'balanceEffects',(SELECT count(*) FROM transaction_balance_effects),
    'recurringItems',(SELECT count(*) FROM recurring_items),'recurringLedgerRows',(SELECT count(*) FROM tx WHERE source='recurring'),
    'budgetPeriods',(SELECT count(*) FROM budget_periods),'budgetAllocations',(SELECT count(*) FROM budget_allocations),
    'snapshots',(SELECT count(*) FROM daily_finance_snapshots),'reversalPairs',(SELECT count(*) FROM tx WHERE reversed_transaction_id IS NOT NULL)/2),
  'accounts',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'archived',archived,'stored',stored::text,'fromTransactions',from_transactions::text,'fromEffects',from_effects::text,
        'balanced', stored=from_transactions AND stored=from_effects) ORDER BY id) FROM derived),
  'position',(SELECT jsonb_agg(jsonb_build_object('user',user_id,'liquidAssets',liquid_assets::text,'cardDebt',card_debt::text,'netPosition',(liquid_assets-card_debt)::text) ORDER BY user_id) FROM position),
  'incomeExpenseByMonth',(SELECT jsonb_agg(jsonb_build_object('user',user_id,'month',month,'expense',e::text,'income',i::text) ORDER BY user_id,month)
        FROM (SELECT user_id,month,sum(expense) e,sum(income) i FROM spend GROUP BY 1,2) s),
  'categorySpend',(SELECT jsonb_agg(jsonb_build_object('user',user_id,'month',month,'category',category_id,'expense',expense::text) ORDER BY user_id,month,category_id) FROM spend WHERE expense>0),
  'budgetVsSpend',(SELECT jsonb_agg(jsonb_build_object('period',p.id,'start',p.period_start,'end',p.period_end,'category',al.category_id,'allocated',al.allocated_minor::text,
        'spent',COALESCE((SELECT sum(t.amount_minor) FROM tx t WHERE t.user_id=p.user_id AND t.type='expense' AND t.status='cleared' AND t.category_id=al.category_id
           AND t.occurred_on BETWEEN p.period_start AND p.period_end AND t.reversed_transaction_id IS NULL),0)::text) ORDER BY p.id,al.category_id)
        FROM budget_periods p JOIN budget_allocations al ON al.budget_period_id=p.id),
  'recurringLedgerRows',(SELECT jsonb_agg(jsonb_build_object('id',id,'key',idempotency_key,'on',occurred_on,'amount',amount_minor::text,'voided',reversed_transaction_id IS NOT NULL) ORDER BY id) FROM tx WHERE source='recurring'),
  'hashes', jsonb_build_object(
    'transactionIds',(SELECT md5(string_agg(id::text,',' ORDER BY id)) FROM tx),
    'transactions',(SELECT md5(string_agg(concat_ws('|',id,user_id,type,title,category_id,from_account_id,to_account_id,occurred_on,amount_minor,fee_minor,source,status,idempotency_key,reversed_transaction_id),E'\n' ORDER BY id)) FROM tx),
    'balanceEffects',(SELECT md5(string_agg(concat_ws('|',id,transaction_id,account_id,role,delta_minor,balance_after_minor),E'\n' ORDER BY id)) FROM transaction_balance_effects),
    'accountsFinancial',(SELECT md5(string_agg(concat_ws('|',id,user_id,name,account_type,classification,opening_balance_minor,current_balance_minor,archived_at),E'\n' ORDER BY id)) FROM financial_accounts),
    'cards',(SELECT md5(string_agg(concat_ws('|',account_id,network,credit_limit_minor,due_day,minimum_payment_minor),E'\n' ORDER BY account_id)) FROM credit_card_details),
    'categories',(SELECT md5(string_agg(concat_ws('|',id,user_id,name,budgetable,allows_income,allows_expense,archived_at),E'\n' ORDER BY id)) FROM categories),
    'recurringItems',(SELECT md5(string_agg(concat_ws('|',id,user_id,merchant,amount_minor,frequency,next_due_date,account_id,category_id,autopay,status,last_paid_date),E'\n' ORDER BY id)) FROM recurring_items),
    'budgets',(SELECT md5(string_agg(concat_ws('|',id,user_id,period_start,period_end,income_pool_minor),E'\n' ORDER BY id)) FROM budget_periods),
    'allocations',(SELECT md5(string_agg(concat_ws('|',id,budget_period_id,category_id,allocated_minor),E'\n' ORDER BY id)) FROM budget_allocations),
    'snapshots',(SELECT md5(string_agg(concat_ws('|',user_id,snapshot_date,asset_total_minor,liability_total_minor,net_worth_minor,card_debt_minor),E'\n' ORDER BY user_id,snapshot_date)) FROM daily_finance_snapshots))
));
