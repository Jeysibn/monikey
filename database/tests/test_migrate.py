from __future__ import annotations

import unittest
from pathlib import Path

from database.migrate import (
    KAKEIBO_MONTH_COLUMNS,
    KAKEIBO_WEEK_COLUMNS,
    MigrationError,
    _applied,
    detect_schema_version,
    migrations,
)


class FakeConnection:
    def __init__(self, columns: dict[str, set[str]], indexes: set[str], constraints: set[str]):
        self.columns = columns
        self.indexes = indexes
        self.constraints = constraints

    def execute(self, query: str, params=None):
        if "information_schema.columns" in query:
            self.rows = [(table, column) for table, cols in self.columns.items() for column in cols]
        elif "FROM pg_indexes" in query:
            self.rows = [(name,) for name in self.indexes]
        elif "FROM pg_constraint" in query:
            self.rows = [(name,) for name in self.constraints]
        return self

    def fetchall(self):
        return self.rows


def schema(version: int = 3) -> FakeConnection:
    columns = {
        "accounts": {"id", "name", "type", "opening_balance", "opening_debt", "credit_limit"},
        "categories": {"id", "name", "type"},
        "transactions": {"id", "account_id", "category_id", "amount", "transaction_date", "note", "created_at"},
        "credit_card_payments": {"id", "source_account_id", "card_account_id", "amount", "payment_date", "note", "created_at"},
        "account_transfers": {"id", "source_account_id", "destination_account_id", "amount", "transfer_date", "note", "created_at"},
    }
    indexes = {
        "idx_accounts_name_normalized", "idx_transactions_account_date", "idx_card_payments_card_date",
        "idx_account_transfers_source_date", "idx_account_transfers_destination_date",
    }
    if version == 1:
        columns.pop("account_transfers")
        indexes -= {"idx_account_transfers_source_date", "idx_account_transfers_destination_date"}
    constraints: set[str] = set()
    if version < 3:
        constraints |= {"accounts_opening_balance_check", "accounts_opening_debt_check"}
    if version >= 4:
        columns["accounts"].add("card_product_id")
        constraints |= {"accounts_card_product_id_format", "accounts_card_product_id_not_cash"}
    if version >= 5:
        columns["categories"].add("default_kakeibo_envelope")
        columns["transactions"].add("kakeibo_envelope")
        columns["kakeibo_month_plans"] = KAKEIBO_MONTH_COLUMNS | ({"plan_presence"} if version >= 6 else set())
        columns["kakeibo_weekly_reviews"] = KAKEIBO_WEEK_COLUMNS
        indexes.add("idx_transactions_kakeibo_date_envelope")
        constraints |= {
            "categories_default_kakeibo_envelope_allowed",
            "categories_default_kakeibo_envelope_expense_only",
            "transactions_kakeibo_envelope_allowed",
        }
    if version >= 6:
        constraints.add("kakeibo_month_plans_plan_presence_check")
    return FakeConnection(columns, indexes, constraints)


class MigrationRunnerTests(unittest.TestCase):
    def test_repository_migrations_are_contiguous_and_checksummed(self):
        found = migrations(Path(__file__).resolve().parents[1])
        self.assertEqual([1, 2, 3, 4, 5, 6], [item.version for item in found])
        self.assertTrue(all(len(item.checksum) == 64 for item in found))

    def test_detects_known_schema_versions(self):
        for version in range(1, 7):
            with self.subTest(version=version):
                expected = 1 if version == 1 else version
                self.assertEqual(expected, detect_schema_version(schema(version)))

    def test_stops_on_partial_migration_markers(self):
        partial = schema(3)
        partial.columns["accounts"].add("card_product_id")
        with self.assertRaisesRegex(MigrationError, "004 appears partially applied"):
            detect_schema_version(partial)

    def test_stops_when_core_schema_is_incomplete(self):
        partial = schema(3)
        del partial.columns["categories"]
        with self.assertRaisesRegex(MigrationError, "missing tables"):
            detect_schema_version(partial)

    def test_stops_when_known_migration_is_partial_or_unknown_objects_exist(self):
        partial = schema(5)
        partial.columns["kakeibo_month_plans"].remove("review_actuals_snapshot")
        with self.assertRaisesRegex(MigrationError, "005 appears partially applied"):
            detect_schema_version(partial)

        unknown = schema(3)
        unknown.columns["transactions"].add("owner_added_column")
        with self.assertRaisesRegex(MigrationError, "Unknown schema columns"):
            detect_schema_version(unknown)

    def test_ledger_must_be_a_contiguous_prefix(self):
        class LedgerConnection:
            def execute(self, query, params=None):
                self.rows = [(1, "001_init.sql", "a" * 64), (3, "003_current_account_amounts.sql", "c" * 64)]
                return self

            def fetchall(self):
                return self.rows

        with self.assertRaisesRegex(MigrationError, "gap"):
            _applied(LedgerConnection(), migrations(Path(__file__).resolve().parents[1]))

    def test_ledger_checksums_must_match_source_files(self):
        class LedgerConnection:
            def execute(self, query, params=None):
                self.rows = [(1, "001_init.sql", "0" * 64)]
                return self

            def fetchall(self):
                return self.rows

        with self.assertRaisesRegex(MigrationError, "checksum"):
            _applied(LedgerConnection(), migrations(Path(__file__).resolve().parents[1]))


if __name__ == "__main__":
    unittest.main()
