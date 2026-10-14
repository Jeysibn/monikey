-- Stage 7B SYNTHETIC legacy dataset. Targets the legacy-baseline schema (migrations up to 20260913100000).
-- Everything is fabricated; no real people, credentials or amounts. Deterministic ids. Today in the story = 2026-10-15.
-- Postings go through helper functions that mirror the legacy ledger's balance-effect rules so balances stay consistent.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.u(n int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

CREATE FUNCTION pg_temp.post(p_id uuid, p_user uuid, p_type text, p_title text, p_cat uuid, p_from uuid, p_to uuid,
  p_on date, p_amt bigint, p_source text, p_key text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE bal bigint; is_card boolean;
BEGIN
  INSERT INTO transactions (id,user_id,type,title,category_id,from_account_id,to_account_id,occurred_on,amount_minor,fee_minor,source,status,idempotency_key)
  VALUES (p_id,p_user,p_type::transaction_type,p_title,p_cat,p_from,p_to,p_on,p_amt,0,p_source::transaction_source,'cleared',p_key);
  IF p_type = 'expense' THEN
    SELECT (account_type='credit_card') INTO is_card FROM financial_accounts WHERE id=p_from;
    UPDATE financial_accounts SET current_balance_minor = current_balance_minor + CASE WHEN is_card THEN p_amt ELSE -p_amt END WHERE id=p_from RETURNING current_balance_minor INTO bal;
    INSERT INTO transaction_balance_effects (transaction_id,account_id,role,delta_minor,balance_after_minor)
      VALUES (p_id,p_from,(CASE WHEN is_card THEN 'card_charge' ELSE 'expense' END)::balance_effect_role, CASE WHEN is_card THEN p_amt ELSE -p_amt END, bal);
  ELSIF p_type = 'income' THEN
    UPDATE financial_accounts SET current_balance_minor = current_balance_minor + p_amt WHERE id=p_to RETURNING current_balance_minor INTO bal;
    INSERT INTO transaction_balance_effects (transaction_id,account_id,role,delta_minor,balance_after_minor) VALUES (p_id,p_to,'income',p_amt,bal);
  ELSE -- transfer; a card destination is a repayment (reduces the amount owed)
    SELECT (account_type='credit_card') INTO is_card FROM financial_accounts WHERE id=p_to;
    UPDATE financial_accounts SET current_balance_minor = current_balance_minor - p_amt WHERE id=p_from RETURNING current_balance_minor INTO bal;
    INSERT INTO transaction_balance_effects (transaction_id,account_id,role,delta_minor,balance_after_minor)
      VALUES (p_id,p_from,(CASE WHEN is_card THEN 'card_payment' ELSE 'source' END)::balance_effect_role,-p_amt,bal);
    UPDATE financial_accounts SET current_balance_minor = current_balance_minor + CASE WHEN is_card THEN -p_amt ELSE p_amt END WHERE id=p_to RETURNING current_balance_minor INTO bal;
    INSERT INTO transaction_balance_effects (transaction_id,account_id,role,delta_minor,balance_after_minor)
      VALUES (p_id,p_to,(CASE WHEN is_card THEN 'card_payment' ELSE 'destination' END)::balance_effect_role, CASE WHEN is_card THEN -p_amt ELSE p_amt END, bal);
  END IF;
END $$;

-- reversal exactly as the legacy ledger does it: a compensating row linked both ways with inverse effects
CREATE FUNCTION pg_temp.reverse(p_orig uuid, p_new uuid, p_on date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o transactions%ROWTYPE; e record; bal bigint;
BEGIN
  SELECT * INTO o FROM transactions WHERE id=p_orig;
  INSERT INTO transactions (id,user_id,type,title,category_id,from_account_id,to_account_id,occurred_on,amount_minor,fee_minor,source,status,note,reversed_transaction_id)
  VALUES (p_new,o.user_id,o.type,'Reversal: '||o.title,o.category_id,o.from_account_id,o.to_account_id,p_on,o.amount_minor,o.fee_minor,'manual','cleared','Reversal of transaction '||o.id,p_orig);
  FOR e IN SELECT * FROM transaction_balance_effects WHERE transaction_id=p_orig LOOP
    UPDATE financial_accounts SET current_balance_minor = current_balance_minor - e.delta_minor WHERE id=e.account_id RETURNING current_balance_minor INTO bal;
    INSERT INTO transaction_balance_effects (transaction_id,account_id,role,delta_minor,balance_after_minor) VALUES (p_new,e.account_id,e.role,-e.delta_minor,bal);
  END LOOP;
  UPDATE transactions SET reversed_transaction_id=p_new WHERE id=p_orig;
END $$;

INSERT INTO users (id,email,password_hash,display_name,timezone,updated_at) VALUES
  (pg_temp.u(1),'ana.synthetic@rehearsal.test','not-a-real-hash','Ana Synthetic','Asia/Manila',now()),
  (pg_temp.u(2),'ben.synthetic@rehearsal.test','not-a-real-hash','Ben Synthetic','Asia/Manila',now());

-- accounts (opening balances in centavos)
INSERT INTO financial_accounts (id,user_id,name,account_type,classification,opening_balance_minor,current_balance_minor,archived_at,updated_at) VALUES
  (pg_temp.u(101),pg_temp.u(1),'Main Checking','checking','asset',5000000,5000000,NULL,now()),
  (pg_temp.u(102),pg_temp.u(1),'Savings','savings','asset',2000000,2000000,NULL,now()),
  (pg_temp.u(103),pg_temp.u(1),'E-Wallet','ewallet','asset',150000,150000,NULL,now()),
  (pg_temp.u(104),pg_temp.u(1),'Visa Card','credit_card','liability',0,0,NULL,now()),
  (pg_temp.u(105),pg_temp.u(1),'Closed Checking (archived)','checking','asset',25000,25000,'2026-03-01T00:00:00Z',now()),
  (pg_temp.u(106),pg_temp.u(1),'Cash','cash','asset',300000,300000,NULL,now()),
  (pg_temp.u(201),pg_temp.u(2),'Ben Checking','checking','asset',1000000,1000000,NULL,now());
INSERT INTO credit_card_details (account_id,network,credit_limit_minor,due_day,minimum_payment_minor,updated_at) VALUES (pg_temp.u(104),'visa',5000000,15,50000,now());

INSERT INTO categories (id,user_id,name,color,budgetable,allows_income,allows_expense,archived_at,updated_at) VALUES
  (pg_temp.u(301),pg_temp.u(1),'Groceries','#0a0',true,false,true,NULL,now()),
  (pg_temp.u(302),pg_temp.u(1),'Utilities','#0aa',true,false,true,NULL,now()),
  (pg_temp.u(303),pg_temp.u(1),'Housing','#00a',true,false,true,NULL,now()),
  (pg_temp.u(304),pg_temp.u(1),'Salary','#aa0',false,true,false,NULL,now()),
  (pg_temp.u(305),pg_temp.u(1),'Old Hobby (archived)','#a0a',true,false,true,'2026-04-01T00:00:00Z',now()),
  (pg_temp.u(306),pg_temp.u(2),'Ben Food','#0a0',true,false,true,NULL,now());

-- ordinary history
SELECT pg_temp.post(pg_temp.u(401),pg_temp.u(1),'income','Salary Sep',pg_temp.u(304),NULL,pg_temp.u(101),'2026-09-01',4500000,'manual','syn-401');
SELECT pg_temp.post(pg_temp.u(402),pg_temp.u(1),'expense','Market run',pg_temp.u(301),pg_temp.u(101),NULL,'2026-09-03',184050,'manual','syn-402');
SELECT pg_temp.post(pg_temp.u(403),pg_temp.u(1),'expense','Card groceries',pg_temp.u(301),pg_temp.u(104),NULL,'2026-09-12',320075,'manual','syn-403');
SELECT pg_temp.post(pg_temp.u(404),pg_temp.u(1),'transfer','To savings',NULL,pg_temp.u(101),pg_temp.u(102),'2026-09-15',500000,'manual','syn-404');
SELECT pg_temp.post(pg_temp.u(405),pg_temp.u(1),'transfer','Card repayment',NULL,pg_temp.u(101),pg_temp.u(104),'2026-09-20',200000,'manual','syn-405');
SELECT pg_temp.post(pg_temp.u(406),pg_temp.u(1),'expense','Electric bill',pg_temp.u(302),pg_temp.u(101),NULL,'2026-09-22',210000,'manual','syn-406');
SELECT pg_temp.post(pg_temp.u(407),pg_temp.u(1),'expense','Mistaken purchase',pg_temp.u(301),pg_temp.u(103),NULL,'2026-09-25',45000,'manual','syn-407');
SELECT pg_temp.reverse(pg_temp.u(407),pg_temp.u(408),'2026-09-26');
SELECT pg_temp.post(pg_temp.u(409),pg_temp.u(1),'income','Salary Oct',pg_temp.u(304),NULL,pg_temp.u(101),'2026-10-01',4500000,'manual','syn-409');
SELECT pg_temp.post(pg_temp.u(410),pg_temp.u(1),'expense','Market run Oct',pg_temp.u(301),pg_temp.u(101),NULL,'2026-10-05',275025,'manual','syn-410');
SELECT pg_temp.post(pg_temp.u(411),pg_temp.u(1),'expense','Old hobby shop',pg_temp.u(305),pg_temp.u(106),NULL,'2026-03-20',99900,'manual','syn-411');
SELECT pg_temp.post(pg_temp.u(412),pg_temp.u(1),'expense','Mistaken transfer fee-less',NULL,pg_temp.u(101),NULL,'2026-10-06',12000,'manual','syn-412');
SELECT pg_temp.post(pg_temp.u(413),pg_temp.u(1),'transfer','Wallet top up',NULL,pg_temp.u(101),pg_temp.u(103),'2026-10-07',100000,'manual','syn-413');
SELECT pg_temp.reverse(pg_temp.u(413),pg_temp.u(414),'2026-10-08');
SELECT pg_temp.post(pg_temp.u(480),pg_temp.u(2),'expense','Ben lunch',pg_temp.u(306),pg_temp.u(201),NULL,'2026-10-02',55000,'manual','syn-480');

-- recurring bills the way the OLD app stored them (no anchor_day / occurrence rows exist yet)
INSERT INTO recurring_items (id,user_id,merchant,amount_minor,frequency,next_due_date,account_id,category_id,autopay,status,last_paid_date,updated_at) VALUES
  (pg_temp.u(501),pg_temp.u(1),'Internet',189900,'monthly','2026-10-30',pg_temp.u(101),pg_temp.u(302),true,'active','2026-09-30',now()),   -- drifted day-30, legacy auto-posted twice
  (pg_temp.u(502),pg_temp.u(1),'Gym',150000,'monthly','2026-09-10',pg_temp.u(101),pg_temp.u(303),true,'active','2026-09-10',now()),       -- STALE: posted for 09-10 but never advanced
  (pg_temp.u(503),pg_temp.u(1),'Streaming',44900,'monthly','2026-09-05',pg_temp.u(104),pg_temp.u(302),true,'paused',NULL,now()),            -- paused by the old worker after a failure
  (pg_temp.u(504),pg_temp.u(1),'Old account bill',30000,'monthly','2026-10-20',pg_temp.u(105),pg_temp.u(302),false,'active',NULL,now()),   -- archived account
  (pg_temp.u(505),pg_temp.u(1),'Weekly water',9000,'weekly','2026-10-10',pg_temp.u(101),pg_temp.u(302),false,'active',NULL,now()),        -- overdue, unpaid, must stay unpaid
  (pg_temp.u(506),pg_temp.u(1),'Insurance',1200000,'yearly','2027-02-28',pg_temp.u(101),pg_temp.u(303),false,'active',NULL,now()),
  (pg_temp.u(507),pg_temp.u(1),'Hobby club',20000,'monthly','2026-10-25',pg_temp.u(106),pg_temp.u(305),false,'active',NULL,now());        -- archived category
SELECT pg_temp.post(pg_temp.u(451),pg_temp.u(1),'expense','Internet',pg_temp.u(302),pg_temp.u(101),NULL,'2026-08-30',189900,'recurring','recurring:00000000-0000-4000-8000-000000000501:2026-08-30');
SELECT pg_temp.post(pg_temp.u(452),pg_temp.u(1),'expense','Internet',pg_temp.u(302),pg_temp.u(101),NULL,'2026-09-30',189900,'recurring','recurring:00000000-0000-4000-8000-000000000501:2026-09-30');
SELECT pg_temp.post(pg_temp.u(453),pg_temp.u(1),'expense','Gym',pg_temp.u(303),pg_temp.u(101),NULL,'2026-09-10',150000,'recurring','recurring:00000000-0000-4000-8000-000000000502:2026-09-10');
SELECT pg_temp.post(pg_temp.u(454),pg_temp.u(1),'expense','Gym',pg_temp.u(303),pg_temp.u(101),NULL,'2026-08-10',150000,'recurring','recurring:00000000-0000-4000-8000-000000000502:2026-08-10');
SELECT pg_temp.reverse(pg_temp.u(454),pg_temp.u(455),'2026-08-12'); -- a legacy auto-posted payment that was later reversed

-- budgets, including legacy date anomalies
INSERT INTO budget_periods (id,user_id,period_start,period_end,income_pool_minor,updated_at) VALUES
  (pg_temp.u(601),pg_temp.u(1),'2026-10-01','2026-10-31',4500000,now()),
  (pg_temp.u(602),pg_temp.u(1),'2026-09-01','2026-09-30',4500000,now()),
  (pg_temp.u(603),pg_temp.u(1),'2026-08-05','2026-09-04',4000000,now()); -- old salary-cycle semantics: not month aligned, overlaps September
INSERT INTO budget_allocations (id,budget_period_id,category_id,allocated_minor,updated_at) VALUES
  (pg_temp.u(611),pg_temp.u(601),pg_temp.u(301),600000,now()),(pg_temp.u(612),pg_temp.u(601),pg_temp.u(302),400000,now()),
  (pg_temp.u(613),pg_temp.u(602),pg_temp.u(301),600000,now()),(pg_temp.u(614),pg_temp.u(603),pg_temp.u(303),1500000,now());

INSERT INTO daily_finance_snapshots (user_id,snapshot_date,asset_total_minor,liability_total_minor,net_worth_minor,card_debt_minor) VALUES
  (pg_temp.u(1),'2026-09-01',9000000,0,9000000,0),
  (pg_temp.u(1),'2026-09-05',8800000,0,8800000,0),   -- gap before
  (pg_temp.u(1),'2026-10-01',9100000,120000,9100000,120000); -- net worth does not equal assets - liabilities (legacy snapshot)
COMMIT;
