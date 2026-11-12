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
    def __init__(
        self,
        tables: dict[str, set[str]],
        constraints: set[str],
        indexes: set[str],
        triggers: set[str] | None = None,
    ):
        self.tables = tables
        self.constraints = constraints
        self.indexes = indexes
        self.triggers = triggers or set()

    def execute(self, query: str):
        if "information_schema.columns" in query:
            return Rows([(table, column) for table, columns in self.tables.items() for column in columns])
        if "pg_constraint" in query:
            return Rows([(name,) for name in self.constraints])
        if "pg_indexes" in query:
            return Rows([(name,) for name in self.indexes])
        if "pg_trigger" in query:
            return Rows([(name,) for name in self.triggers])
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


def baseline_006() -> CatalogConnection:
    connection = baseline_003()
    connection.tables["accounts"].add("card_product_id")
    connection.tables["categories"].add("default_kakeibo_envelope")
    connection.tables["transactions"].add("kakeibo_envelope")
    connection.tables["kakeibo_month_plans"] = {
        "month", "planned_income", "allocated_starting_funds", "savings_target",
        "prior_period_debt_reserve", "needs_limit", "wants_limit", "culture_limit",
        "unexpected_limit", "monthly_intention", "actual_saved_declared", "review_available",
        "review_savings", "review_change", "review_appreciated", "review_surprise",
        "review_lesson", "reviewed_at", "review_actuals_snapshot", "created_at", "updated_at",
        "plan_presence",
    }
    connection.tables["kakeibo_weekly_reviews"] = {
        "week_start", "surprise_note", "worthwhile_note", "next_week_intention", "created_at", "updated_at",
    }
    connection.constraints.update({
        "accounts_card_product_id_format",
        "accounts_card_product_id_not_cash",
        "categories_default_kakeibo_envelope_allowed",
        "categories_default_kakeibo_envelope_expense_only",
        "transactions_kakeibo_envelope_allowed",
        "kakeibo_month_plans_plan_presence_check",
    })
    connection.indexes.update({"idx_transactions_kakeibo_date_envelope"})
    return connection


def baseline_007() -> CatalogConnection:
    connection = baseline_006()
    connection.tables["categories"].add("is_archived")
    connection.constraints.update({"categories_name_not_blank", "categories_name_trimmed"})
    connection.indexes.add("idx_categories_normalized_name_type")
    connection.triggers.update({"categories_type_immutable", "transactions_archived_category_guard"})
    return connection


def baseline_008() -> CatalogConnection:
    connection = baseline_007()
    connection.tables["categories"].add("icon_key")
    connection.constraints.add("categories_icon_key_allowed")
    return connection


def baseline_009() -> CatalogConnection:
    connection = baseline_008()
    connection.tables["categories"].add("color_key")
    connection.constraints.add("categories_color_key_allowed")
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

    def test_migration_009_follows_icons_and_keeps_older_baselines(self):
        self.assertEqual(len(migrate.MIGRATIONS), 9)
        self.assertEqual(migrate.infer_baseline(baseline_008()), 8)
        self.assertEqual(migrate.infer_baseline(baseline_009()), 9)

    def test_refuses_partial_migration_009_state(self):
        connection = baseline_009()
        connection.constraints.remove("categories_color_key_allowed")
        with self.assertRaisesRegex(migrate.MigrationError, "009 appears partial"):
            migrate.infer_baseline(connection)

    def test_migration_008_follows_category_lifecycle_without_changing_older_baselines(self):
        self.assertEqual(len(migrate.MIGRATIONS), 9)
        self.assertEqual(migrate.infer_baseline(baseline_006()), 6)
        self.assertEqual(migrate.infer_baseline(baseline_007()), 7)
        self.assertEqual(migrate.infer_baseline(baseline_008()), 8)

    def test_refuses_partial_migration_008_state(self):
        connection = baseline_008()
        connection.constraints.remove("categories_icon_key_allowed")
        with self.assertRaisesRegex(migrate.MigrationError, "008 appears partial"):
            migrate.infer_baseline(connection)

    def test_refuses_partial_migration_007_state(self):
        connection = baseline_007()
        connection.triggers.remove("transactions_archived_category_guard")
        with self.assertRaisesRegex(migrate.MigrationError, "007 appears partial"):
            migrate.infer_baseline(connection)

    def test_blocks_pending_migrations_without_release_authorization(self):
        with self.assertRaisesRegex(migrate.MigrationError, "verified release workflow"):
            migrate.require_migration_permission(3, apply_missing=False)
            migrate.require_migration_permission(6, apply_missing=False)
        migrate.require_migration_permission(9, apply_missing=False)

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
