"""Apply MoniKey SQL migrations with an advisory lock and checksum ledger."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psycopg


DATABASE_DIR = Path(__file__).resolve().parent
LEDGER = "schema_migrations"
LOCK_ID = 731_042_006
VERSIONED_SQL = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")
BEGIN_LINE = re.compile(r"(?m)^\s*BEGIN;\s*$")
COMMIT_LINE = re.compile(r"(?m)^\s*COMMIT;\s*$")
BASE_TABLES = {
    "accounts": {"id", "name", "type", "opening_balance", "opening_debt", "credit_limit"},
    "categories": {"id", "name", "type"},
    "transactions": {"id", "account_id", "category_id", "amount", "transaction_date", "note", "created_at"},
    "credit_card_payments": {"id", "source_account_id", "card_account_id", "amount", "payment_date", "note", "created_at"},
}
TRANSFER_COLUMNS = {"id", "source_account_id", "destination_account_id", "amount", "transfer_date", "note", "created_at"}
KAKEIBO_MONTH_COLUMNS = {
    "month", "planned_income", "allocated_starting_funds", "savings_target",
    "prior_period_debt_reserve", "needs_limit", "wants_limit", "culture_limit",
    "unexpected_limit", "monthly_intention", "actual_saved_declared", "review_available",
    "review_savings", "review_change", "review_appreciated", "review_surprise",
    "review_lesson", "reviewed_at", "review_actuals_snapshot", "created_at", "updated_at",
}
KAKEIBO_WEEK_COLUMNS = {"week_start", "surprise_note", "worthwhile_note", "next_week_intention", "created_at", "updated_at"}


class MigrationError(RuntimeError):
    """A database state is unsafe to migrate automatically."""


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    path: Path
    checksum: str


def migrations(directory: Path = DATABASE_DIR) -> list[Migration]:
    found: list[Migration] = []
    for path in sorted(directory.glob("*.sql")):
        match = VERSIONED_SQL.fullmatch(path.name)
        if not match:
            continue
        content = path.read_bytes()
        found.append(Migration(int(match.group(1)), path.name, path, hashlib.sha256(content).hexdigest()))
    if not found or [item.version for item in found] != list(range(1, found[-1].version + 1)):
        raise MigrationError("Migration files must be numbered contiguously from 001.")
    return found


def _table_columns(connection: Any) -> dict[str, set[str]]:
    rows = connection.execute(
        """SELECT table_name, column_name
           FROM information_schema.columns
           WHERE table_schema = current_schema()"""
    ).fetchall()
    columns: dict[str, set[str]] = {}
    for table, column in rows:
        columns.setdefault(table, set()).add(column)
    return columns


def _names(connection: Any, query: str) -> set[str]:
    return {row[0] for row in connection.execute(query).fetchall()}


def detect_schema_version(connection: Any) -> int:
    """Return the highest complete known schema version; reject partial shapes."""
    columns = _table_columns(connection)
    if not columns:
        return 0

    known_tables = set(BASE_TABLES) | {"account_transfers", "kakeibo_month_plans", "kakeibo_weekly_reviews", LEDGER}
    unknown_tables = columns.keys() - known_tables
    if unknown_tables:
        raise MigrationError(f"Unknown schema tables are present: {', '.join(sorted(unknown_tables))}.")

    missing_tables = set(BASE_TABLES) - columns.keys()
    if missing_tables:
        raise MigrationError(f"Unknown or partial MoniKey schema; missing tables: {', '.join(sorted(missing_tables))}.")
    for table, expected in BASE_TABLES.items():
        if not expected <= columns[table]:
            raise MigrationError(f"Unknown or partial MoniKey schema; required columns are missing from {table}.")

    known_columns = {table: set(values) for table, values in BASE_TABLES.items()}
    known_columns.update({
        "account_transfers": TRANSFER_COLUMNS,
        "kakeibo_month_plans": KAKEIBO_MONTH_COLUMNS | {"plan_presence"},
        "kakeibo_weekly_reviews": KAKEIBO_WEEK_COLUMNS,
        LEDGER: {"version", "script_name", "checksum", "applied_at"},
    })
    known_columns["accounts"].add("card_product_id")
    known_columns["categories"].add("default_kakeibo_envelope")
    known_columns["transactions"].add("kakeibo_envelope")
    for table, observed in columns.items():
        extra = observed - known_columns[table]
        if extra:
            raise MigrationError(f"Unknown schema columns in {table}: {', '.join(sorted(extra))}.")

    indexes = _names(connection, """SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()""")
    required_indexes = {"idx_accounts_name_normalized", "idx_transactions_account_date", "idx_card_payments_card_date"}
    if not required_indexes <= indexes:
        raise MigrationError("Unknown or partial MoniKey schema; a core lookup index is missing.")

    version = 1
    if "account_transfers" in columns:
        if not TRANSFER_COLUMNS <= columns["account_transfers"] or not {
            "idx_account_transfers_source_date", "idx_account_transfers_destination_date"
        } <= indexes:
            raise MigrationError("Migration 002 appears partially applied.")
        version = 2
    elif {"idx_account_transfers_source_date", "idx_account_transfers_destination_date"} & indexes:
        raise MigrationError("Migration 002 appears partially applied.")

    constraints = _names(connection, """SELECT conname FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace""")
    amount_constraints = {"accounts_opening_balance_check", "accounts_opening_debt_check"}
    if amount_constraints <= constraints:
        version = min(version, 2)
    elif amount_constraints & constraints:
        raise MigrationError("Migration 003 appears partially applied.")
    elif version >= 2:
        version = 3

    card_markers = {"accounts_card_product_id_format", "accounts_card_product_id_not_cash"}
    has_card_column = "card_product_id" in columns["accounts"]
    if has_card_column or card_markers & constraints:
        if not has_card_column or not card_markers <= constraints:
            raise MigrationError("Migration 004 appears partially applied.")
        version = 4

    kakeibo_tables = {"kakeibo_month_plans", "kakeibo_weekly_reviews"}
    kakeibo_columns = (
        "default_kakeibo_envelope" in columns["categories"]
        and "kakeibo_envelope" in columns["transactions"]
    )
    kakeibo_index = "idx_transactions_kakeibo_date_envelope" in indexes
    kakeibo_constraints = {
        "categories_default_kakeibo_envelope_allowed",
        "categories_default_kakeibo_envelope_expense_only",
        "transactions_kakeibo_envelope_allowed",
    } <= constraints
    if kakeibo_tables & columns.keys() or kakeibo_columns or kakeibo_index:
        complete_kakeibo_tables = (
            KAKEIBO_MONTH_COLUMNS <= columns.get("kakeibo_month_plans", set())
            and KAKEIBO_WEEK_COLUMNS <= columns.get("kakeibo_weekly_reviews", set())
        )
        if (
            not kakeibo_tables <= columns.keys()
            or not complete_kakeibo_tables
            or not kakeibo_columns
            or not kakeibo_index
            or not kakeibo_constraints
        ):
            raise MigrationError("Migration 005 appears partially applied.")
        version = 5

    presence_constraint = "kakeibo_month_plans_plan_presence_check" in constraints
    presence_column = "plan_presence" in columns.get("kakeibo_month_plans", set())
    if presence_column or presence_constraint:
        if not presence_column or not presence_constraint:
            raise MigrationError("Migration 006 appears partially applied.")
        version = 6
    return version


def _ledger_exists(connection: Any) -> bool:
    row = connection.execute("SELECT to_regclass(%s)", (LEDGER,)).fetchone()
    return row[0] is not None


def _create_ledger(connection: Any) -> None:
    connection.execute(
        f"""CREATE TABLE {LEDGER} (
          version INTEGER PRIMARY KEY,
          script_name TEXT NOT NULL,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"""
    )


def _record(connection: Any, migration: Migration) -> None:
    connection.execute(
        f"INSERT INTO {LEDGER} (version, script_name, checksum) VALUES (%s, %s, %s)",
        (migration.version, migration.name, migration.checksum),
    )


def _applied(connection: Any, available: list[Migration]) -> int:
    expected = {item.version: item for item in available}
    rows = connection.execute(
        f"SELECT version, script_name, checksum FROM {LEDGER} ORDER BY version"
    ).fetchall()
    versions = [row[0] for row in rows]
    if versions != list(range(1, len(versions) + 1)):
        raise MigrationError("Migration ledger has a gap or duplicate version; stopping safely.")
    for version, name, checksum in rows:
        migration = expected.get(version)
        if migration is None:
            raise MigrationError(f"Database records unknown migration version {version}.")
        if name != migration.name or checksum.strip() != migration.checksum:
            raise MigrationError(f"Migration {version:03d} checksum or filename does not match this release.")
    return versions[-1] if versions else 0


def _is_empty(connection: Any) -> bool:
    row = connection.execute(
        """SELECT COUNT(*) FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = current_schema()
             AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
             """
    ).fetchone()
    return row[0] == 0


def run(adopt: bool = False) -> tuple[int, list[int]]:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise MigrationError("DATABASE_URL is required.")

    available = migrations()
    connection = None
    for attempt in range(60):
        try:
            connection = psycopg.connect(database_url, connect_timeout=5)
            break
        except psycopg.OperationalError:
            if attempt == 59:
                raise
            time.sleep(2)
    assert connection is not None
    with connection:
        connection.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
        try:
            exists = _ledger_exists(connection)
            if adopt:
                if exists:
                    raise MigrationError("A migration ledger already exists; adoption is a one-time operation.")
                version = detect_schema_version(connection)
                if version < 1:
                    raise MigrationError("The database is empty; use the normal migration Job to initialize it.")
                _create_ledger(connection)
                for migration in available:
                    if migration.version > version:
                        break
                    _record(connection, migration)
                connection.commit()
                return version, []

            if not exists:
                if not _is_empty(connection):
                    raise MigrationError("Existing schema has no migration ledger; run the approved adoption workflow first.")
                _create_ledger(connection)
                # 001_init.sql is the maintained fresh-database snapshot and
                # already includes the effects of 002 and 003. Record that
                # verified baseline in the same transaction so a failure leaves
                # the database completely empty and safe to retry.
                baseline = available[:3]
                try:
                    connection.execute(baseline[0].path.read_text(encoding="utf-8"), prepare=False)
                    connection.execute((DATABASE_DIR / "seed.sql").read_text(encoding="utf-8"), prepare=False)
                    for migration in baseline:
                        _record(connection, migration)
                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise

            current = _applied(connection, available)
            observed = detect_schema_version(connection)
            if observed != current:
                raise MigrationError(
                    f"Database schema is version {observed:03d}, but its ledger says {current:03d}; stopping safely."
                )

            connection.commit()
            applied_now: list[int] = []
            for migration in available[current:]:
                try:
                    sql = migration.path.read_text(encoding="utf-8")
                    sql = BEGIN_LINE.sub("", sql, count=1)
                    sql = COMMIT_LINE.sub("", sql.rstrip(), count=1)
                    connection.execute(sql, prepare=False)
                    if migration.version == 1:
                        connection.execute((DATABASE_DIR / "seed.sql").read_text(encoding="utf-8"), prepare=False)
                    _record(connection, migration)
                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise
                applied_now.append(migration.version)

            final = _applied(connection, available)
            observed = detect_schema_version(connection)
            if observed != final:
                raise MigrationError(
                    f"Migration completed with schema version {observed:03d}, but ledger says {final:03d}."
                )
            return final, applied_now
        finally:
            connection.rollback()
            connection.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adopt", action="store_true", help="record a verified existing schema without changing it")
    args = parser.parse_args()
    try:
        version, applied = run(adopt=args.adopt)
    except Exception as error:
        print(f"Migration stopped: {error}", file=sys.stderr)
        return 1
    if args.adopt:
        print(f"Adopted verified schema version {version:03d}; no SQL migrations were run.")
    elif applied:
        print(f"Applied migrations {', '.join(f'{version:03d}' for version in applied)}; schema is version {version:03d}.")
    else:
        print(f"Schema is current at version {version:03d}; no migrations were pending.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
