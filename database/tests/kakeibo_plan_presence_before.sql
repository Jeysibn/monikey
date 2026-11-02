-- A pre-006 row cannot reveal whether zero-valued plan fields were intentional.
INSERT INTO kakeibo_month_plans (
  month, planned_income, needs_limit, review_available, reviewed_at,
  review_actuals_snapshot
)
VALUES (
  '2020-01-01', 0, 0, 'Legacy reflection stays readable.', '2020-02-01T00:00:00Z',
  '{"actual_income":"0.00","total_expenses":"0.00","unclassified":"0.00","envelopes":{"needs":"0.00","wants":"0.00","culture":"0.00","unexpected":"0.00"}}'::jsonb
);
