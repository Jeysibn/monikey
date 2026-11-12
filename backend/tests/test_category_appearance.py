"""Category color, the wider icon set and usage counts (ADR-026). Appearance is presentation only."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from database import open_connection
from fastapi.testclient import TestClient
from main import app

import main

client = TestClient(app)
NEW_ICONS = ["coffee", "bus", "receipt", "smartphone", "plane", "wallet", "banknote", "dumbbell", "shirt", "paw-print", "music", "wrench"]
COLORS = ["blue", "green", "teal", "amber", "orange", "red", "pink", "purple", "indigo", "slate"]


def unique(prefix: str) -> str:
    return f"{prefix} {uuid4().hex[:8]}"


def make_category(**fields: object) -> dict:
    response = client.post("/api/categories", json={"name": unique("Appearance"), "type": "expense", **fields})
    assert response.status_code == 201, response.text
    return response.json()


def make_account() -> int:
    response = client.post("/api/accounts", json={"name": unique("Appearance cash"), "type": "cash"})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def spend(account_id: int, category_id: int, amount: str = "10.00") -> int:
    response = client.post(
        "/api/transactions",
        json={"account_id": account_id, "category_id": category_id, "amount": amount, "transaction_date": "2026-10-10"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_color_and_icon_are_optional_persisted_and_returned_everywhere():
    plain = make_category()
    assert plain["color_key"] is None and plain["icon_key"] is None and plain["usage_count"] == 0

    styled = make_category(icon_key="coffee", color_key="teal")
    assert (styled["icon_key"], styled["color_key"]) == ("coffee", "teal")
    assert client.get(f"/api/categories/{styled['id']}").json()["color_key"] == "teal"
    listed = next(row for row in client.get("/api/categories").json() if row["id"] == styled["id"])
    assert (listed["icon_key"], listed["color_key"]) == ("coffee", "teal")


@pytest.mark.parametrize("icon", NEW_ICONS)
def test_every_widened_icon_key_is_accepted(icon: str):
    assert make_category(icon_key=icon)["icon_key"] == icon


@pytest.mark.parametrize("color", COLORS)
def test_every_curated_color_key_is_accepted(color: str):
    assert make_category(color_key=color)["color_key"] == color


@pytest.mark.parametrize("custom", ["#3a7bd5", "#000000", "#ffffff"])
def test_a_custom_hex_color_is_accepted_and_stored_lower_case(custom: str):
    assert make_category(color_key=custom)["color_key"] == custom
    assert make_category(color_key=custom.upper().replace("#", "#"))["color_key"] == custom  # normalized, never stored in capitals


@pytest.mark.parametrize("bad", ["#fff", "#ff00", "#ff00000", "ff0000", "#gg0000", "#ff0000; x", "red; background:url(x)", "RED", "magenta", "", "rgb(0,0,0)", "url(x)", "#ff0000 "])
def test_anything_but_a_curated_name_or_six_digit_hex_is_rejected(bad: str):
    created = client.post("/api/categories", json={"name": unique("Bad color"), "type": "expense", "color_key": bad})
    assert created.status_code == 422
    category = make_category()
    changed = client.patch(f"/api/categories/{category['id']}", json={"color_key": bad})
    assert changed.status_code == 422
    assert client.get(f"/api/categories/{category['id']}").json()["color_key"] is None


def test_patch_updates_only_what_is_supplied_and_null_clears():
    category = make_category(icon_key="gift", color_key="amber")
    only_color = client.patch(f"/api/categories/{category['id']}", json={"color_key": "indigo"}).json()
    assert (only_color["icon_key"], only_color["color_key"], only_color["name"]) == ("gift", "indigo", category["name"])
    renamed = client.patch(f"/api/categories/{category['id']}", json={"name": unique("Renamed")}).json()
    assert (renamed["icon_key"], renamed["color_key"]) == ("gift", "indigo")
    cleared = client.patch(f"/api/categories/{category['id']}", json={"color_key": None}).json()
    assert cleared["color_key"] is None and cleared["icon_key"] == "gift"
    assert client.patch(f"/api/categories/{category['id']}", json={}).status_code == 422


def test_usage_count_counts_all_transactions_and_follows_deletes_and_archive():
    account = make_account()
    used = make_category()
    other = make_category()
    first = spend(account, used["id"])
    spend(account, used["id"], "5.50")
    spend(account, other["id"])

    counts = {row["id"]: row["usage_count"] for row in client.get("/api/categories").json()}
    assert counts[used["id"]] == 2 and counts[other["id"]] == 1
    assert client.get(f"/api/categories/{used['id']}").json()["usage_count"] == 2

    archived = client.patch(f"/api/categories/{used['id']}/archive", json={"is_archived": True}).json()
    assert archived["usage_count"] == 2  # archived rows keep counting their history

    assert client.delete(f"/api/transactions/{first}").status_code == 204
    assert client.get(f"/api/categories/{used['id']}").json()["usage_count"] == 1
    assert client.delete(f"/api/categories/{used['id']}").status_code == 409  # still referenced


def test_category_list_is_one_query_however_many_categories_exist():
    for _ in range(12):
        make_category(color_key="blue")
    statements: list[str] = []

    class Counting:
        def __init__(self, connection):
            self.connection = connection

        def __enter__(self):
            self.connection.__enter__()
            return self

        def __exit__(self, *exc):
            return self.connection.__exit__(*exc)

        def execute(self, query, *args, **kwargs):
            statements.append(str(query))
            return self.connection.execute(query, *args, **kwargs)

    original = main.open_connection
    main.open_connection = lambda: Counting(original())
    try:
        rows = client.get("/api/categories").json()
    finally:
        main.open_connection = original
    assert len(rows) > 12
    assert len(statements) == 1, statements
    assert all(isinstance(row["usage_count"], int) for row in rows)


def test_appearance_changes_never_touch_amounts_envelopes_or_archive_state():
    account = make_account()
    category = make_category(default_kakeibo_envelope="needs")
    transaction = client.post(
        "/api/transactions",
        json={"account_id": account, "category_id": category["id"], "amount": "19.75", "transaction_date": "2026-10-10", "kakeibo_envelope": "culture"},
    )
    assert transaction.status_code == 201, transaction.text

    client.patch(f"/api/categories/{category['id']}", json={"icon_key": "music", "color_key": "pink", "default_kakeibo_envelope": "wants"})
    with open_connection() as connection:
        row = connection.execute(
            "SELECT category_id, amount, kakeibo_envelope FROM transactions WHERE id = %s", (transaction.json()["id"],)
        ).fetchone()
        archived = connection.execute("SELECT is_archived FROM categories WHERE id = %s", (category["id"],)).fetchone()
    assert row == {"category_id": category["id"], "amount": Decimal("19.75"), "kakeibo_envelope": "culture"}
    assert archived == {"is_archived": False}


def test_python_allowlists_match_migration_009():
    import re
    from pathlib import Path
    from typing import get_args

    sql = (Path(__file__).parents[2] / "database" / "009_category_colors.sql").read_text()
    icons = re.search(r"categories_icon_key_allowed CHECK \((.*?)\n  \);", sql, re.S).group(1)
    colors = re.search(r"categories_color_key_allowed CHECK \((.*?)\n  \)", sql, re.S).group(1)
    assert "color_key ~ '^#[0-9a-f]{6}$'" in colors  # the custom-hex form is enforced by the database too
    assert set(re.findall(r"'([a-z0-9-]+)'", icons)) == set(get_args(main.CategoryIconKey))
    assert set(re.findall(r"'([a-z0-9-]+)'", colors)) == set(main.CURATED_COLOR_KEYS)
