-- Repeatable category seed. The name/type unique key preserves user data
-- and allows "Other" to exist once for income and once for expense.

INSERT INTO categories (name, type)
VALUES
  ('Salary', 'income'),
  ('Freelance', 'income'),
  ('Other', 'income'),
  ('Food', 'expense'),
  ('Transportation', 'expense'),
  ('Groceries', 'expense'),
  ('Bills', 'expense'),
  ('Shopping', 'expense'),
  ('Other', 'expense')
ON CONFLICT (name, type) DO NOTHING;
