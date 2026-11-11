"""Activity search and filters: optional query parameters on the three Activity reads, applied before LIMIT."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from test_api import category_id, create_account, create_payment, create_transaction

MONTH = "2026-10"


def transfer(client: TestClient, source: int, destination: int, amount: str, date: str, note: str | None = None) -> dict[str, Any]:
    response = client.post("/api/account-transfers", json={"source_account_id": source, "destination_account_id": destination, "amount": amount, "transfer_date": date, "note": note})
    assert response.status_code == 201, response.text
    return response.json()


def get(client: TestClient, path: str, **params: object) -> list[dict[str, Any]]:
    response = client.get(path, params={"month": MONTH, **params})
    assert response.status_code == 200, response.text
    return response.json()


def seed(client: TestClient) -> dict[str, int]:
    bank = create_account(client, "Filter Bank", "bank", opening_balance="9000.00")
    cash = create_account(client, "Filter Cash", "cash", opening_balance="1000.00")
    card = create_account(client, "Filter Card", "credit_card", credit_limit="9000.00")
    return {
        "bank": bank["id"], "cash": cash["id"], "card": card["id"],
        "salary": category_id(client, "Salary", "income"), "food": category_id(client, "Food", "expense"), "bills": category_id(client, "Bills", "expense"),
    }


def notes(rows: list[dict[str, Any]]) -> list[str | None]:
    return [row["note"] for row in rows]


def test_search_matches_note_category_and_account_ignoring_case_and_spacing(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "10.00", "2026-10-02", "Lunch with team")
    create_transaction(client, ids["cash"], ids["bills"], "20.00", "2026-10-03", "Wifi")
    create_transaction(client, ids["bank"], ids["salary"], "30.00", "2026-10-04", "October pay")
    assert notes(get(client, "/api/transactions", q="  LUNCH   with ")) == ["Lunch with team"]  # note
    assert notes(get(client, "/api/transactions", q="bills")) == ["Wifi"]  # category name
    assert sorted(notes(get(client, "/api/transactions", q="filter bank")), key=str) == ["Lunch with team", "October pay"]  # account name
    assert get(client, "/api/transactions", q="zzz-no-match") == []
    assert len(get(client, "/api/transactions", q="")) == 3  # a blank search is no search
    assert len(get(client, "/api/transactions", q="   ")) == 3


def test_percent_underscore_and_backslash_are_matched_literally(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "1.00", "2026-10-02", "100% sure")
    create_transaction(client, ids["bank"], ids["food"], "1.00", "2026-10-03", "a_b")
    create_transaction(client, ids["bank"], ids["food"], "1.00", "2026-10-04", "axb")
    create_transaction(client, ids["bank"], ids["food"], "1.00", "2026-10-05", "path\\x")
    assert notes(get(client, "/api/transactions", q="%")) == ["100% sure"]  # not "everything"
    assert notes(get(client, "/api/transactions", q="a_b")) == ["a_b"]  # not the wildcard that would also match "axb"
    assert notes(get(client, "/api/transactions", q="\\")) == ["path\\x"]
    assert len(get(client, "/api/transactions", q="_")) == 1


def test_category_and_kind_filters_and_their_combinations(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "10.00", "2026-10-02", "food")
    create_transaction(client, ids["bank"], ids["bills"], "20.00", "2026-10-03", "bills")
    create_transaction(client, ids["bank"], ids["salary"], "30.00", "2026-10-04", "pay")
    assert notes(get(client, "/api/transactions", category_id=ids["food"])) == ["food"]
    assert sorted(notes(get(client, "/api/transactions", kind="expense")), key=str) == ["bills", "food"]
    assert notes(get(client, "/api/transactions", kind="income")) == ["pay"]
    assert notes(get(client, "/api/transactions", category_id=ids["food"], kind="expense")) == ["food"]
    assert get(client, "/api/transactions", category_id=ids["food"], kind="income") == []  # an invalid combination matches nothing
    assert notes(get(client, "/api/transactions", category_id=ids["bills"], q="bills", account_id=ids["bank"])) == ["bills"]
    assert get(client, "/api/transactions", category_id=999_999) == []  # an unknown category is an empty result, not an error


def test_filters_apply_before_the_limit_so_older_matches_are_never_dropped(client: TestClient) -> None:
    ids = seed(client)
    for day in range(1, 6):  # five older matches
        create_transaction(client, ids["bank"], ids["food"], "1.00", f"2026-10-0{day}", f"coffee {day}")
    for day in range(10, 14):  # four newer rows that do not match
        create_transaction(client, ids["bank"], ids["bills"], "1.00", f"2026-10-{day}", "power")
    page = get(client, "/api/transactions", q="coffee", limit=2)
    assert notes(page) == ["coffee 5", "coffee 4"]  # the newest MATCHING rows, even though four newer rows exist
    assert notes(get(client, "/api/transactions", category_id=ids["food"], limit=3)) == ["coffee 5", "coffee 4", "coffee 3"]
    assert len(get(client, "/api/transactions", q="coffee", limit=6)) == 5  # exactly the matches, no padding
    assert get(client, "/api/transactions", q="coffee", month="2026-09") == []  # the month still bounds the search (no cross-month search)


def test_search_covers_card_payments_and_transfers_by_note_and_both_accounts(client: TestClient) -> None:
    ids = seed(client)
    create_payment(client, ids["bank"], ids["card"], "50.00", "2026-10-06", "October card bill")
    create_payment(client, ids["cash"], ids["card"], "5.00", "2026-10-07", None)
    transfer(client, ids["bank"], ids["cash"], "40.00", "2026-10-08", "Weekly allowance")
    transfer(client, ids["cash"], ids["bank"], "4.00", "2026-10-09", None)
    assert notes(get(client, "/api/credit-card-payments", q="card bill")) == ["October card bill"]
    assert len(get(client, "/api/credit-card-payments", q="filter bank")) == 1  # the paying account
    assert len(get(client, "/api/credit-card-payments", q="filter card")) == 2  # the card that was paid
    assert notes(get(client, "/api/account-transfers", q="allowance")) == ["Weekly allowance"]
    assert len(get(client, "/api/account-transfers", q="filter cash")) == 2  # either side
    assert get(client, "/api/account-transfers", q="nothing") == []
    assert len(get(client, "/api/account-transfers", q="filter bank", account_id=ids["cash"])) == 2  # search and account filter combine
    assert len(get(client, "/api/credit-card-payments", q="filter card", limit=1)) == 1  # filtered before the limit


def test_old_calls_without_the_new_parameters_behave_exactly_as_before(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "10.00", "2026-10-02", "one")
    create_payment(client, ids["bank"], ids["card"], "5.00", "2026-10-03")
    transfer(client, ids["bank"], ids["cash"], "4.00", "2026-10-04")
    assert len(get(client, "/api/transactions")) == 1
    assert len(get(client, "/api/credit-card-payments")) == 1
    assert len(get(client, "/api/account-transfers")) == 1
    assert len(get(client, "/api/transactions", account_id=ids["bank"], limit=1)) == 1


@pytest.mark.parametrize("path,params", [
    ("/api/transactions", {"q": "x" * 81}),
    ("/api/credit-card-payments", {"q": "x" * 81}),
    ("/api/account-transfers", {"q": "x" * 81}),
    ("/api/transactions", {"kind": "payment"}),
    ("/api/transactions", {"kind": "transfer"}),
    ("/api/transactions", {"category_id": 0}),
    ("/api/transactions", {"category_id": "abc"}),
])
def test_invalid_filter_values_are_rejected_in_words(client: TestClient, path: str, params: dict[str, object]) -> None:
    response = client.get(path, params={"month": MONTH, **params})
    assert response.status_code == 422, response.text


def test_search_text_cannot_inject_sql(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "1.00", "2026-10-02", "safe")
    assert get(client, "/api/transactions", q="'; DROP TABLE transactions; --") == []
    assert notes(get(client, "/api/transactions")) == ["safe"]  # still there
