"""Offline tests for schema adoption and migration ordering safeguards."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


RUNNER_PATH = Path(__file__).parents[1] / "migrate.py"
SPEC = importlib.util.spec_from_file_location("monikey_migrate", RUNNER_PATH)
assert SPEC and SPEC.loader
migrate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migrate)


class CatalogConnection:
    def __init__(self, tables: dict[str, set[str]], constraints: set[str], indexes: set[str]):
        self.tables = tables
        self.constraints = constraints
        self.indexes = indexes

    def execute(self, query: str):
        if "information_schema.columns" in query:
            return Rows([(table, column) for table, columns in self.tables.items() for column in columns])
        if "pg_constraint" in query:
            return Rows([(name,) for name in self.constraints])
        if "pg_indexes" in query:
            return Rows([(name,) for name in self.indexes])
        raise AssertionError(f"Unexpected query: {query}")


class Rows:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


def baseline_001() -> CatalogConnection:
    return CatalogConnection(
        {
            "accounts": {"id", "name", "type", "opening_balance", "opening_debt", "credit_limit"},
            "categories": {"id", "name", "type"},
            "transactions": {"id", "account_id", "category_id", "amount", "transaction_date", "note", "created_at"},
            "credit_card_payments": {"id", "source_account_id", "card_account_id", "amount", "payment_date", "note", "created_at"},
        },
        {"accounts_opening_balance_check", "accounts_opening_debt_check"},
        {"idx_accounts_name_normalized", "idx_transactions_account_date", "idx_card_payments_card_date"},
    )


def baseline_003() -> CatalogConnection:
    connection = baseline_001()
    connection.tables["account_transfers"] = {
        "id", "source_account_id", "destination_account_id", "amount", "transfer_date", "note", "created_at"
    }
    connection.indexes.update({"idx_account_transfers_source_date", "idx_account_transfers_destination_date"})
    connection.constraints.clear()
    return connection


class MigrationRunnerTests(unittest.TestCase):
    def test_refuses_to_adopt_partial_core_schema(self):
        connection = baseline_001()
        connection.tables.pop("credit_card_payments")
        with self.assertRaisesRegex(migrate.MigrationError, "all five"):
            migrate.infer_baseline(connection)

    def test_refuses_partial_migration_003_state(self):
        connection = baseline_001()
        connection.tables["account_transfers"] = {
            "id", "source_account_id", "destination_account_id", "amount", "transfer_date", "note", "created_at"
        }
        connection.indexes.update({"idx_account_transfers_source_date", "idx_account_transfers_destination_date"})
        connection.constraints.remove("accounts_opening_debt_check")
        with self.assertRaisesRegex(migrate.MigrationError, "003 appears partial"):
            migrate.infer_baseline(connection)

    def test_never_adopts_blank_database_as_migration_001(self):
        connection = CatalogConnection({}, set(), set())
        with self.assertRaisesRegex(migrate.MigrationError, "all five"):
            migrate.infer_baseline(connection)

    def test_requires_transfer_migration_before_signed_amount_baseline(self):
        connection = baseline_001()
        connection.constraints.clear()
        with self.assertRaisesRegex(migrate.MigrationError, "without migration 002"):
            migrate.infer_baseline(connection)

    def test_recognizes_complete_existing_schema_at_migration_003(self):
        self.assertEqual(migrate.infer_baseline(baseline_003()), 3)

    def test_rejects_unrecognized_extra_tables_and_columns(self):
        connection = baseline_003()
        connection.tables["financial_backup"] = {"id"}
        with self.assertRaisesRegex(migrate.MigrationError, "unrecognized tables"):
            migrate.infer_baseline(connection)

        connection = baseline_003()
        connection.tables["accounts"].add("untracked_field")
        with self.assertRaisesRegex(migrate.MigrationError, "unrecognized column set"):
            migrate.infer_baseline(connection)


if __name__ == "__main__":
    unittest.main()
