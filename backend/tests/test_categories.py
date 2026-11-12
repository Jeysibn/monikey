from __future__ import annotations

from decimal import Decimal
from threading import Event, Thread
from time import monotonic, sleep

import psycopg
from database import open_connection
from main import app
from fastapi.testclient import TestClient


client = TestClient(app)


def category_id(name: str, category_type: str) -> int:
    with open_connection() as connection:
        row = connection.execute(
            "SELECT id FROM categories WHERE name = %s AND type = %s",
            (name, category_type),
        ).fetchone()
    assert row is not None
    return row["id"]


def create_cash_account() -> int:
    response = client.post("/api/accounts", json={"name": "Category test cash", "type": "cash"})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_category_create_normalizes_names_and_rejects_ambiguous_duplicates():
    response = client.post(
        "/api/categories",
        json={"name": "  Dining   Out  ", "type": "expense", "default_kakeibo_envelope": "wants"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["name"] == "Dining Out"
    assert response.json()["default_kakeibo_envelope"] == "wants"
    assert response.json()["is_archived"] is False
    assert response.json()["icon_key"] is None

    duplicate = client.post("/api/categories", json={"name": "dining out", "type": "expense"})
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "duplicate_category_name"

    same_name_income = client.post("/api/categories", json={"name": "Dining Out", "type": "income"})
    assert same_name_income.status_code == 201


def test_category_icon_is_optional_validated_editable_and_presentation_only():
    no_icon = client.post("/api/categories", json={"name": "No icon", "type": "expense"})
    assert no_icon.status_code == 201
    assert no_icon.json()["icon_key"] is None

    created = client.post(
        "/api/categories",
        json={"name": "Icon category", "type": "expense", "icon_key": "shopping-basket"},
    )
    assert created.status_code == 201, created.text
    category = created.json()
    assert category["icon_key"] == "shopping-basket"
    account = create_cash_account()
    transaction = client.post(
        "/api/transactions",
        json={"account_id": account, "category_id": category["id"], "amount": "19.75", "transaction_date": "2026-10-02", "kakeibo_envelope": "needs"},
    )
    assert transaction.status_code == 201

    invalid = client.patch(f"/api/categories/{category['id']}", json={"icon_key": "https://example.invalid/icon.svg"})
    assert invalid.status_code == 422
    unsupported = client.post("/api/categories", json={"name": "Unknown icon", "type": "income", "icon_key": "script-alert"})
    assert unsupported.status_code == 422

    changed = client.patch(f"/api/categories/{category['id']}", json={"icon_key": "gift"})
    assert changed.status_code == 200
    assert changed.json()["icon_key"] == "gift"
    renamed = client.patch(f"/api/categories/{category['id']}", json={"name": "Icon category renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["icon_key"] == "gift"
    assert client.get("/api/categories/{category_id}".format(category_id=category["id"])).json()["icon_key"] == "gift"
    archived = client.patch(f"/api/categories/{category['id']}/archive", json={"is_archived": True})
    assert archived.status_code == 200
    assert archived.json()["icon_key"] == "gift"
    restored = client.patch(f"/api/categories/{category['id']}/archive", json={"is_archived": False})
    assert restored.json()["icon_key"] == "gift"

    with open_connection() as connection:
        row = connection.execute(
            "SELECT id, category_id, amount, kakeibo_envelope FROM transactions WHERE id = %s",
            (transaction.json()["id"],),
        ).fetchone()
    assert row == {"id": transaction.json()["id"], "category_id": category["id"], "amount": Decimal("19.75"), "kakeibo_envelope": "needs"}

    cleared = client.patch(f"/api/categories/{category['id']}", json={"icon_key": None})
    assert cleared.status_code == 200
    assert cleared.json()["icon_key"] is None
    assert client.get("/api/categories").json()


def test_category_names_and_envelope_type_are_validated():
    for name in ("", "   ", "\t  \n"):
        response = client.post("/api/categories", json={"name": name, "type": "expense"})
        assert response.status_code == 422

    too_long = client.post("/api/categories", json={"name": "x" * 61, "type": "income"})
    assert too_long.status_code == 422

    income_envelope = client.post(
        "/api/categories",
        json={"name": "Bonus", "type": "income", "default_kakeibo_envelope": "needs"},
    )
    assert income_envelope.status_code == 422

    invalid_envelope = client.post(
        "/api/categories",
        json={"name": "Books custom", "type": "expense", "default_kakeibo_envelope": "savings"},
    )
    assert invalid_envelope.status_code == 422


def test_rename_and_default_change_preserve_transaction_and_financial_values():
    created = client.post(
        "/api/categories",
        json={"name": "Category before", "type": "expense", "default_kakeibo_envelope": "needs"},
    )
    category = created.json()
    account = create_cash_account()
    transaction = client.post(
        "/api/transactions",
        json={
            "account_id": account,
            "category_id": category["id"],
            "amount": "123.45",
            "transaction_date": "2026-10-02",
            "kakeibo_envelope": "wants",
        },
    )
    assert transaction.status_code == 201, transaction.text

    updated = client.patch(
        f"/api/categories/{category['id']}",
        json={"name": "Category after", "default_kakeibo_envelope": "culture"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["id"] == category["id"]
    assert updated.json()["name"] == "Category after"
    assert updated.json()["default_kakeibo_envelope"] == "culture"

    with open_connection() as connection:
        row = connection.execute(
            "SELECT category_id, amount, kakeibo_envelope FROM transactions WHERE id = %s",
            (transaction.json()["id"],),
        ).fetchone()
        account_balance = connection.execute(
            """SELECT a.opening_balance - COALESCE(SUM(t.amount), 0) AS balance
                 FROM accounts AS a LEFT JOIN transactions AS t ON t.account_id = a.id
                WHERE a.id = %s GROUP BY a.id""",
            (account,),
        ).fetchone()["balance"]
    assert row == {"category_id": category["id"], "amount": Decimal("123.45"), "kakeibo_envelope": "wants"}
    assert account_balance == Decimal("-123.45")

    invalid_type = client.patch(f"/api/categories/{category['id']}", json={"type": "income"})
    assert invalid_type.status_code == 422


def test_archived_categories_remain_readable_and_existing_transactions_editable():
    created = client.post("/api/categories", json={"name": "Archive candidate", "type": "expense"})
    category = created.json()
    account = create_cash_account()
    transaction = client.post(
        "/api/transactions",
        json={
            "account_id": account,
            "category_id": category["id"],
            "amount": "40.00",
            "transaction_date": "2026-10-02",
            "kakeibo_envelope": "needs",
        },
    ).json()

    archived = client.patch(f"/api/categories/{category['id']}/archive", json={"is_archived": True})
    assert archived.status_code == 200
    assert archived.json()["is_archived"] is True
    assert client.get("/api/categories", params={"status": "archived"}).json()[0]["id"] == category["id"]
    assert category["id"] not in [row["id"] for row in client.get("/api/categories", params={"status": "active"}).json()]

    blocked = client.post(
        "/api/transactions",
        json={
            "account_id": account,
            "category_id": category["id"],
            "amount": "1.00",
            "transaction_date": "2026-10-03",
            "kakeibo_envelope": "needs",
        },
    )
    assert blocked.status_code == 409

    edited = client.put(
        f"/api/transactions/{transaction['id']}",
        json={
            "account_id": account,
            "category_id": category["id"],
            "amount": "45.00",
            "transaction_date": "2026-10-02",
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["kakeibo_envelope"] == "needs"
    assert edited.json()["category_id"] == category["id"]

    protected = client.delete(f"/api/categories/{category['id']}")
    assert protected.status_code == 409
    assert protected.json()["error"]["code"] == "category_in_use"

    restored = client.patch(f"/api/categories/{category['id']}/archive", json={"is_archived": False})
    assert restored.status_code == 200
    assert restored.json()["is_archived"] is False


def test_unused_category_can_be_deleted_and_missing_category_is_not_found():
    created = client.post("/api/categories", json={"name": "Unused custom", "type": "income"}).json()
    assert client.delete(f"/api/categories/{created['id']}").status_code == 204
    assert client.get(f"/api/categories/{created['id']}").status_code == 404
    assert client.delete("/api/categories/999999").status_code == 404


def test_category_delete_lock_serializes_with_concurrent_transaction_creation():
    created = client.post("/api/categories", json={"name": "Concurrent delete candidate", "type": "expense"}).json()
    account = create_cash_account()
    started = Event()
    connection_ready = Event()
    outcome: dict[str, str] = {}

    def create_transaction() -> None:
        started.set()
        try:
            with open_connection() as transaction_connection:
                transaction_connection.execute("SET application_name = 'monikey-category-delete-test'")
                connection_ready.set()
                transaction_connection.execute(
                    """INSERT INTO transactions
                       (account_id, category_id, amount, transaction_date, note)
                       VALUES (%s, %s, 1.00, DATE '2026-10-03', 'Concurrent category creation')""",
                    (account, created["id"]),
                )
            outcome["result"] = "inserted"
        except psycopg.errors.ForeignKeyViolation:
            outcome["result"] = "category_deleted_first"

    with open_connection() as connection:
        connection.execute("SELECT id FROM categories WHERE id = %s FOR UPDATE", (created["id"],))
        assert connection.execute(
            "SELECT EXISTS (SELECT 1 FROM transactions WHERE category_id = %s) AS referenced", (created["id"],)
        ).fetchone()["referenced"] is False

        thread = Thread(target=create_transaction)
        thread.start()
        assert started.wait(timeout=2)
        assert connection_ready.wait(timeout=2)
        deadline = monotonic() + 5
        waiting = False
        while monotonic() < deadline:
            waiting = connection.execute(
                """SELECT EXISTS (
                       SELECT 1 FROM pg_stat_activity
                        WHERE application_name = 'monikey-category-delete-test'
                          AND cardinality(pg_blocking_pids(pid)) > 0
                   ) AS waiting"""
            ).fetchone()["waiting"]
            if waiting:
                break
            sleep(0.02)
        assert waiting, (
            "the insert should be blocked on the category row lock before deletion; "
            f"outcome={outcome}, alive={thread.is_alive()}"
        )
        connection.execute("DELETE FROM categories WHERE id = %s", (created["id"],))

    thread.join(timeout=5)
    assert not thread.is_alive()
    assert outcome["result"] == "category_deleted_first"
