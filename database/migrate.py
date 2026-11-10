"""Apply ordered MoniKey migrations with checksum and adoption safeguards.

The numbered SQL files remain the migration source of truth.  This runner only
adds a small ledger around them; it never executes 001 against an existing DB.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

try:
    import psycopg
except ModuleNotFoundError:  # Allows catalog logic tests to run without the DB driver.
    psycopg = None  # type: ignore[assignment]


MIGRATION_DIR = Path(__file__).resolve().parent
MIGRATIONS = tuple(MIGRATION_DIR / f"{version:03d}_{name}.sql" for version, name in (
    (1, "init"),
    (2, "account_transfers"),
    (3, "current_account_amounts"),
    (4, "account_card_product"),
    (5, "kakeibo"),
    (6, "kakeibo_plan_presence"),
    (7, "custom_categories"),
    (8, "category_icons"),
))
LEDGER = "monikey_schema_migrations"
LOCK_KEY = 741_309_221


class MigrationError(RuntimeError):
    """The live schema cannot be advanced safely."""


def _catalog(connection: psycopg.Connection) -> dict[str, set[str]]:
    rows = connection.execute(
        """SELECT table_name, column_name
             FROM information_schema.columns
            WHERE table_schema = current_schema()"""
    ).fetchall()
    tables: dict[str, set[str]] = {}
    for table, column in rows:
        tables.setdefault(table, set()).add(column)
    return tables


def _constraints(connection: psycopg.Connection) -> set[str]:
    rows = connection.execute(
        """SELECT conname FROM pg_constraint
            WHERE connamespace = current_schema()::regnamespace"""
    ).fetchall()
    return {row[0] for row in rows}


def _indexes(connection: psycopg.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()"
        ).fetchall()
    }


def _triggers(connection: psycopg.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            """SELECT tgname FROM pg_trigger
                WHERE tgrelid IN (to_regclass('categories'), to_regclass('transactions'))
                  AND NOT tgisinternal"""
        ).fetchall()
    }


def infer_baseline(connection: psycopg.Connection) -> int:
    """Return the highest fully recognizable schema version or stop safely."""
    tables = _catalog(connection)
    constraints = _constraints(connection)
    indexes = _indexes(connection)
    triggers = _triggers(connection)
    core = {
        "accounts": {"id", "name", "type", "opening_balance", "opening_debt", "credit_limit"},
        "categories": {"id", "name", "type"},
        "transactions": {"id", "account_id", "category_id", "amount", "transaction_date", "note", "created_at"},
        "credit_card_payments": {"id", "source_account_id", "card_account_id", "amount", "payment_date", "note", "created_at"},
    }
    present = {name for name in core if name in tables}
    if present != set(core):
        raise MigrationError("Existing schema does not contain all five MoniKey ledger tables; refusing adoption.")
    for table, columns in core.items():
        if not columns.issubset(tables[table]):
            raise MigrationError(f"Existing table {table} is missing expected columns; refusing adoption.")
    required_indexes = {
        "idx_accounts_name_normalized", "idx_transactions_account_date",
        "idx_card_payments_card_date",
    }
    if not required_indexes.issubset(indexes):
        raise MigrationError("Existing schema is missing an initial MoniKey index; refusing adoption.")

    transfer_present = {
        "idx_account_transfers_source_date", "idx_account_transfers_destination_date"
    }.issubset(indexes)
    if "account_transfers" in tables and not transfer_present:
        raise MigrationError("Migration 002 appears partial; refusing adoption.")
    if "account_transfers" not in tables:
        version = 1
    else:
        transfer_columns = {"id", "source_account_id", "destination_account_id", "amount", "transfer_date", "note", "created_at"}
        if not transfer_columns.issubset(tables["account_transfers"]):
            raise MigrationError("Migration 002 appears partial; refusing adoption.")
        version = 2

    amount_constraints = {"accounts_opening_balance_check", "accounts_opening_debt_check"}
    if amount_constraints.issubset(constraints):
        if version > 1 and version != 2:
            raise MigrationError("Migration 003 state is inconsistent; refusing adoption.")
    elif amount_constraints.isdisjoint(constraints):
        if version < 2:
            raise MigrationError("Migration 003 is present without migration 002; refusing adoption.")
        version = max(version, 3)
    else:
        raise MigrationError("Migration 003 appears partial; refusing adoption.")

    card_column = "card_product_id" in tables["accounts"]
    card_constraints = {"accounts_card_product_id_format", "accounts_card_product_id_not_cash"}
    if card_column != card_constraints.issubset(constraints):
        raise MigrationError("Migration 004 appears partial; refusing adoption.")
    if card_column:
        if version < 3:
            raise MigrationError("Migration 004 is present without migration 003; refusing adoption.")
        version = max(version, 4)

    kakeibo_tables = {"kakeibo_month_plans", "kakeibo_weekly_reviews"}
    kakeibo_markers = (
        "default_kakeibo_envelope" in tables["categories"],
        "kakeibo_envelope" in tables["transactions"],
        "idx_transactions_kakeibo_date_envelope" in indexes,
        kakeibo_tables.issubset(tables),
    )
    if any(kakeibo_markers) and not all(kakeibo_markers):
        raise MigrationError("Migration 005 appears partial; refusing adoption.")
    if all(kakeibo_markers):
        if version < 4:
            raise MigrationError("Migration 005 is present without migration 004; refusing adoption.")
        version = max(version, 5)

    presence_column = "plan_presence" in tables.get("kakeibo_month_plans", set())
    if presence_column and not all(kakeibo_markers):
        raise MigrationError("Migration 006 exists without a complete migration 005 schema.")
    if presence_column:
        if "kakeibo_month_plans_plan_presence_check" not in constraints:
            raise MigrationError("Migration 006 appears partial; refusing adoption.")
        version = max(version, 6)

    category_007_constraints = {
        "categories_name_not_blank",
        "categories_name_trimmed",
    }
    category_007_markers = (
        "is_archived" in tables["categories"],
        "idx_categories_normalized_name_type" in indexes,
        category_007_constraints.issubset(constraints),
        "categories_type_immutable" in triggers,
        "transactions_archived_category_guard" in triggers,
    )
    if any(category_007_markers) and not all(category_007_markers):
        raise MigrationError("Migration 007 appears partial; refusing adoption.")
    if all(category_007_markers):
        if version < 6:
            raise MigrationError("Migration 007 is present without a complete migration 006 schema.")
        version = 7

    category_008_markers = (
        "icon_key" in tables["categories"],
        "categories_icon_key_allowed" in constraints,
    )
    if any(category_008_markers) and not all(category_008_markers):
        raise MigrationError("Migration 008 appears partial; refusing adoption.")
    if all(category_008_markers):
        if version < 7:
            raise MigrationError("Migration 008 is present without a complete migration 007 schema.")
        version = 8

    known_tables = set(core) | {"account_transfers", LEDGER}
    if version >= 5:
        known_tables |= kakeibo_tables
    unexpected_tables = set(tables) - known_tables
    if unexpected_tables:
        raise MigrationError("Existing schema contains unrecognized tables; refusing adoption.")

    expected_columns = {name: set(columns) for name, columns in core.items()}
    if LEDGER in tables:
        expected_columns[LEDGER] = {"version", "checksum", "applied_at"}
    if version >= 2:
        expected_columns["account_transfers"] = {
            "id", "source_account_id", "destination_account_id", "amount", "transfer_date", "note", "created_at"
        }
    if version >= 4:
        expected_columns["accounts"].add("card_product_id")
    if version >= 5:
        expected_columns["categories"].add("default_kakeibo_envelope")
        expected_columns["transactions"].add("kakeibo_envelope")
        expected_columns["kakeibo_month_plans"] = {
            "month", "planned_income", "allocated_starting_funds", "savings_target",
            "prior_period_debt_reserve", "needs_limit", "wants_limit", "culture_limit",
            "unexpected_limit", "monthly_intention", "actual_saved_declared", "review_available",
            "review_savings", "review_change", "review_appreciated", "review_surprise",
            "review_lesson", "reviewed_at", "review_actuals_snapshot", "created_at", "updated_at",
        }
        expected_columns["kakeibo_weekly_reviews"] = {
            "week_start", "surprise_note", "worthwhile_note", "next_week_intention", "created_at", "updated_at"
        }
    if version >= 6:
        expected_columns["kakeibo_month_plans"].add("plan_presence")
    if version >= 7:
        expected_columns["categories"].add("is_archived")
    if version >= 8:
        expected_columns["categories"].add("icon_key")
    for table, columns in expected_columns.items():
        if tables.get(table) != columns:
            raise MigrationError(f"Existing table {table} has an unrecognized column set; refusing adoption.")

    expected_custom_indexes = required_indexes.copy()
    if version >= 2:
        expected_custom_indexes |= {"idx_account_transfers_source_date", "idx_account_transfers_destination_date"}
    if version >= 5:
        expected_custom_indexes.add("idx_transactions_kakeibo_date_envelope")
    if version >= 7:
        expected_custom_indexes.add("idx_categories_normalized_name_type")
    actual_custom_indexes = {name for name in indexes if name.startswith("idx_")}
    if actual_custom_indexes != expected_custom_indexes:
        raise MigrationError("Existing schema has missing or unrecognized MoniKey indexes; refusing adoption.")

    if version >= 5:
        required_kakeibo_constraints = {
            "categories_default_kakeibo_envelope_allowed",
            "categories_default_kakeibo_envelope_expense_only",
            "transactions_kakeibo_envelope_allowed",
        }
        if not required_kakeibo_constraints.issubset(constraints):
            raise MigrationError("Migration 005 appears partial; refusing adoption.")
    return version


def _migration_data() -> list[tuple[int, Path, str]]:
    migrations = []
    for version, path in enumerate(MIGRATIONS, start=1):
        content = path.read_text(encoding="utf-8")
        migrations.append((version, path, hashlib.sha256(content.encode()).hexdigest()))
    return migrations


def require_migration_permission(baseline: int, *, apply_missing: bool) -> None:
    """Block an Argo sync from advancing schema without a backup-gated release."""
    if not apply_missing and baseline < len(MIGRATIONS):
        raise MigrationError(
            f"Migration {baseline + 1:03d} is pending; a verified release workflow must authorize schema changes."
        )


def migrate(
    connection: psycopg.Connection,
    *,
    allow_adoption: bool = False,
    apply_missing: bool = True,
) -> int:
    """Adopt a known pre-ledger schema if allowed, then apply missing versions."""
    if not connection.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_KEY,)).fetchone()[0]:
        raise MigrationError("Another MoniKey migration is already running.")
    try:
        exists = connection.execute(
            "SELECT to_regclass(%s)", (f"public.{LEDGER}",)
        ).fetchone()[0]
        migrations = _migration_data()
        if exists:
            recorded = connection.execute(
                f"SELECT version, checksum FROM {LEDGER} ORDER BY version"
            ).fetchall()
            expected = {version: checksum for version, _, checksum in migrations}
            seen: set[int] = set()
            for version, checksum in recorded:
                if version not in expected or expected[version] != checksum:
                    raise MigrationError(f"Recorded migration {version} has an unknown version or checksum.")
                seen.add(version)
            if seen and seen != set(range(1, max(seen) + 1)):
                raise MigrationError("Migration ledger has a version gap; refusing to continue.")
            baseline = max(seen, default=0)
            actual_baseline = infer_baseline(connection)
            if actual_baseline != baseline:
                raise MigrationError(
                    f"Migration ledger is at {baseline:03d}, but the live schema matches {actual_baseline:03d}."
                )
        else:
            if not allow_adoption:
                raise MigrationError("Migration ledger is absent; run the protected one-time adoption procedure.")
            baseline = infer_baseline(connection)
            if baseline == 0:
                raise MigrationError("No complete known MoniKey schema was found; refusing to run 001 or adopt.")
            if not apply_missing:
                raise MigrationError("Schema adoption requires a verified release workflow to authorize migration.")
            connection.execute(
                f"""CREATE TABLE {LEDGER} (
                    version INTEGER PRIMARY KEY,
                    checksum CHAR(64) NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )"""
            )
            for version, _, checksum in migrations[:baseline]:
                connection.execute(
                    f"INSERT INTO {LEDGER} (version, checksum) VALUES (%s, %s)",
                    (version, checksum),
                )
            connection.commit()

        require_migration_permission(baseline, apply_missing=apply_missing)
        for version, path, checksum in migrations:
            if version <= baseline:
                continue
            if version == 1:
                raise MigrationError("Migration 001 is initialization-only and is never run by the migration runner.")
            sql = "\n".join(
                line for line in path.read_text(encoding="utf-8").splitlines()
                if line.strip().upper() not in {"BEGIN;", "COMMIT;"}
            )
            with connection.transaction():
                connection.execute(sql, prepare=False)
                connection.execute(
                    f"INSERT INTO {LEDGER} (version, checksum) VALUES (%s, %s)",
                    (version, checksum),
                )
                actual_baseline = infer_baseline(connection)
                if actual_baseline != version:
                    raise MigrationError(
                        f"Migration {version:03d} completed, but the resulting schema did not match it."
                    )
            baseline = version
        return baseline
    finally:
        connection.execute("SELECT pg_advisory_unlock(%s)", (LOCK_KEY,))


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    adoption = os.environ.get("MONIKEY_MIGRATION_ADOPT", "false").lower() == "true"
    apply_missing = os.environ.get("MONIKEY_MIGRATION_APPLY", "false").lower() == "true"
    if adoption and not apply_missing:
        raise SystemExit("MONIKEY_MIGRATION_ADOPT requires MONIKEY_MIGRATION_APPLY=true")
    if psycopg is None:
        raise SystemExit("psycopg is required to run database migrations")
    with psycopg.connect(url, connect_timeout=5) as connection:
        version = migrate(connection, allow_adoption=adoption, apply_missing=apply_missing)
    print(f"MoniKey schema is at migration {version:03d}.")


if __name__ == "__main__":
    main()
