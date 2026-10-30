from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient

from main import ApiProblem, MAX_API_MONEY, format_money


def create_account(
    client: TestClient,
    name: str,
    account_type: str,
    **overrides: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "type": account_type,
        "opening_balance": "0.00",
        "opening_debt": "0.00",
        "credit_limit": None,
    }
    payload.update(overrides)
    response = client.post("/api/accounts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def create_transaction(
    client: TestClient,
    account_id: int,
    category_id: int,
    amount: str,
    transaction_date: str = "2026-10-15",
    note: str | None = None,
) -> dict[str, Any]:
    response = client.post(
        "/api/transactions",
        json={
            "account_id": account_id,
            "category_id": category_id,
            "amount": amount,
            "transaction_date": transaction_date,
            "note": note,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_payment(
    client: TestClient,
    source_account_id: int,
    card_account_id: int,
    amount: str,
    payment_date: str = "2026-10-20",
    note: str | None = None,
) -> dict[str, Any]:
    response = client.post(
        "/api/credit-card-payments",
        json={
            "source_account_id": source_account_id,
            "card_account_id": card_account_id,
            "amount": amount,
            "payment_date": payment_date,
            "note": note,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def category_id(client: TestClient, name: str, category_type: str) -> int:
    response = client.get("/api/categories", params={"type": category_type})
    assert response.status_code == 200
    return next(row["id"] for row in response.json() if row["name"] == name)


def test_money_output_stays_inside_the_frontend_exact_integer_bound() -> None:
    assert format_money(MAX_API_MONEY) == "45035996273704.95"
    with pytest.raises(ApiProblem) as error:
        format_money(MAX_API_MONEY + Decimal("0.01"))
    assert error.value.status == 500
    assert error.value.code == "internal_error"


def test_health_categories_and_empty_summary(client: TestClient) -> None:
    assert client.get("/api/health/live").json() == {"status": "ok"}
    assert client.get("/api/health/ready").json() == {"status": "ok"}

    categories = client.get("/api/categories").json()
    assert len(categories) == 9
    other_categories = [row for row in categories if row["name"] == "Other"]
    assert {row["type"] for row in other_categories} == {"income", "expense"}

    summary = client.get("/api/summary", params={"month": "2026-10"})
    assert summary.status_code == 200
    assert summary.json() == {
        "month": "2026-10",
        "liquid_balance": "0.00",
        "outstanding_debt": "0.00",
        "card_credit": "0.00",
        "net_position": "0.00",
        "month_income": "0.00",
        "month_expenses": "0.00",
    }


def test_accounts_are_computed_and_duplicate_names_conflict(client: TestClient) -> None:
    bank = create_account(client, "Daily Bank", "bank", opening_balance="5000.00")
    card = create_account(
        client,
        "Travel Card",
        "credit_card",
        opening_debt="250.00",
        credit_limit="20000.00",
    )
    assert bank == {"id": 1, "name": "Daily Bank", "type": "bank", "balance": "5000.00"}
    assert card == {
        "id": 2,
        "name": "Travel Card",
        "type": "credit_card",
        "credit_limit": "20000.00",
        "outstanding_signed_debt": "250.00",
        "available_credit": "19750.00",
        "owed": "250.00",
        "credit": "0.00",
    }

    duplicate = client.post(
        "/api/accounts",
        json={
            "name": "Daily Bank",
            "type": "bank",
            "opening_balance": "0.00",
            "opening_debt": "0.00",
            "credit_limit": None,
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "duplicate_account_name"
    assert duplicate.json()["error"]["field"] == "name"

    case_insensitive_duplicate = client.post(
        "/api/accounts",
        json={
            "name": "  daily BANK  ",
            "type": "bank",
            "opening_balance": "0.00",
            "opening_debt": "0.00",
            "credit_limit": None,
        },
    )
    assert case_insensitive_duplicate.status_code == 409
    assert case_insensitive_duplicate.json()["error"]["code"] == "duplicate_account_name"


def test_transaction_and_payment_crud_and_server_summaries(client: TestClient) -> None:
    bank = create_account(client, "Daily Bank", "bank", opening_balance="5000.00")
    cash = create_account(client, "Cash Wallet", "cash", opening_balance="200.00")
    card = create_account(
        client,
        "Travel Card",
        "credit_card",
        opening_debt="100.00",
        credit_limit="20000.00",
    )
    salary_id = category_id(client, "Salary", "income")
    grocery_id = category_id(client, "Groceries", "expense")
    food_id = category_id(client, "Food", "expense")

    salary = create_transaction(client, bank["id"], salary_id, "1000.00", "2026-10-01", "Pay")
    card_purchase = create_transaction(client, card["id"], grocery_id, "350.00", note="Groceries")
    bank_purchase = create_transaction(client, bank["id"], food_id, "300.00", note="Lunch")
    payment = create_payment(client, bank["id"], card["id"], "200.00", note="Card payment")
    assert salary["amount"] == "1000.00"
    assert card_purchase["amount"] == "350.00"
    assert payment["amount"] == "200.00"
    assert payment["created_at"].endswith("Z")

    category_type_change = client.put(
        f"/api/transactions/{salary['id']}",
        json={
            "account_id": bank["id"],
            "category_id": food_id,
            "amount": "1000.00",
            "transaction_date": "2026-10-01",
            "note": "Pay",
        },
    )
    assert category_type_change.status_code == 400
    assert category_type_change.json()["error"]["code"] == "invalid_account_type_combination"

    accounts = client.get("/api/accounts").json()
    bank_row = next(row for row in accounts if row["id"] == bank["id"])
    cash_row = next(row for row in accounts if row["id"] == cash["id"])
    card_row = next(row for row in accounts if row["id"] == card["id"])
    assert bank_row["balance"] == "5500.00"
    assert cash_row["balance"] == "200.00"
    assert card_row["outstanding_signed_debt"] == "250.00"
    assert card_row["available_credit"] == "19750.00"

    summary = client.get("/api/summary", params={"month": "2026-10"}).json()
    assert summary == {
        "month": "2026-10",
        "liquid_balance": "5700.00",
        "outstanding_debt": "250.00",
        "card_credit": "0.00",
        "net_position": "5450.00",
        "month_income": "1000.00",
        "month_expenses": "650.00",
    }

    card_transactions = client.get(
        "/api/transactions",
        params={"month": "2026-10", "account_id": card["id"], "limit": 10},
    ).json()
    assert [row["id"] for row in card_transactions] == [card_purchase["id"]]

    all_transactions = client.get(
        "/api/transactions",
        params={"month": "2026-10", "limit": 10},
    ).json()
    activity_order = [
        (row["transaction_date"], row["created_at"], row["id"])
        for row in all_transactions
    ]
    assert activity_order == sorted(activity_order, reverse=True)
    assert len(client.get(
        "/api/transactions",
        params={"month": "2026-10", "limit": 1},
    ).json()) == 1
    assert client.get(
        "/api/transactions",
        params={"month": "2026-09", "limit": 10},
    ).json() == []

    assert client.get(
        "/api/credit-card-payments",
        params={"month": "2026-10", "account_id": card["id"]},
    ).json() == [payment]
    assert client.get(
        "/api/credit-card-payments",
        params={"month": "2026-10", "account_id": bank["id"]},
    ).json() == [payment]

    updated_purchase = client.put(
        f"/api/transactions/{card_purchase['id']}",
        json={
            "account_id": card["id"],
            "category_id": grocery_id,
            "amount": "500.00",
            "transaction_date": "2026-10-16",
            "note": "Updated groceries",
        },
    )
    assert updated_purchase.status_code == 200
    assert updated_purchase.json()["amount"] == "500.00"

    updated_payment = client.put(
        f"/api/credit-card-payments/{payment['id']}",
        json={
            "source_account_id": bank["id"],
            "card_account_id": card["id"],
            "amount": "150.00",
            "payment_date": "2026-10-21",
            "note": "Updated payment",
        },
    )
    assert updated_payment.status_code == 200
    assert updated_payment.json()["amount"] == "150.00"

    assert client.delete(f"/api/transactions/{card_purchase['id']}").status_code == 204
    assert client.delete(f"/api/credit-card-payments/{payment['id']}").status_code == 204
    card_after_delete = next(row for row in client.get("/api/accounts").json() if row["id"] == card["id"])
    assert card_after_delete["outstanding_signed_debt"] == "100.00"
    assert client.delete(f"/api/transactions/{bank_purchase['id']}").status_code == 204
    assert client.delete(f"/api/transactions/{salary['id']}").status_code == 204


def test_card_overpayment_is_credit_not_debt_or_expense(client: TestClient) -> None:
    bank = create_account(client, "Daily Bank", "bank", opening_balance="500.00")
    card = create_account(
        client,
        "Travel Card",
        "credit_card",
        opening_debt="100.00",
        credit_limit="5000.00",
    )
    create_payment(client, bank["id"], card["id"], "150.00")

    card_row = client.get("/api/accounts").json()[1]
    assert card_row["outstanding_signed_debt"] == "-50.00"
    assert card_row["available_credit"] == "5050.00"
    assert card_row["owed"] == "0.00"
    assert card_row["credit"] == "50.00"

    summary = client.get("/api/summary", params={"month": "2026-10"}).json()
    assert summary["liquid_balance"] == "350.00"
    assert summary["outstanding_debt"] == "0.00"
    assert summary["card_credit"] == "50.00"
    assert summary["net_position"] == "400.00"
    assert summary["month_expenses"] == "0.00"


def test_invalid_business_combinations_and_references_use_safe_errors(client: TestClient) -> None:
    bank = create_account(client, "Daily Bank", "bank")
    card = create_account(client, "Travel Card", "credit_card", credit_limit="5000.00")
    salary_id = category_id(client, "Salary", "income")
    grocery_id = category_id(client, "Groceries", "expense")

    card_income = client.post(
        "/api/transactions",
        json={
            "account_id": card["id"],
            "category_id": salary_id,
            "amount": "10.00",
            "transaction_date": "2026-10-01",
            "note": None,
        },
    )
    assert card_income.status_code == 400
    assert card_income.json()["error"]["code"] == "invalid_account_type_combination"
    assert card_income.json()["error"]["field"] == "category_id"

    card_pays_bank = client.post(
        "/api/credit-card-payments",
        json={
            "source_account_id": card["id"],
            "card_account_id": bank["id"],
            "amount": "10.00",
            "payment_date": "2026-10-01",
            "note": None,
        },
    )
    assert card_pays_bank.status_code == 400
    assert card_pays_bank.json()["error"]["code"] == "invalid_account_type_combination"

    invalid_references = client.post(
        "/api/transactions",
        json={
            "account_id": 999,
            "category_id": grocery_id,
            "amount": "10.00",
            "transaction_date": "2026-10-01",
            "note": None,
        },
    )
    assert invalid_references.status_code == 400
    assert invalid_references.json()["error"]["code"] == "invalid_field"


def test_schema_validation_and_missing_records_have_contract_errors(client: TestClient) -> None:
    invalid_money = client.post(
        "/api/accounts",
        json={
            "name": "Broken Account",
            "type": "bank",
            "opening_balance": 12.50,
            "opening_debt": "0.00",
            "credit_limit": None,
        },
    )
    assert invalid_money.status_code == 422
    assert invalid_money.json()["error"]["code"] == "invalid_field"
    assert invalid_money.json()["error"]["field"] == "opening_balance"

    invalid_precision = client.post(
        "/api/transactions",
        json={
            "account_id": 1,
            "category_id": 1,
            "amount": "1.001",
            "transaction_date": "2026-10-01",
            "note": None,
        },
    )
    assert invalid_precision.status_code == 422
    assert invalid_precision.json()["error"]["field"] == "amount"

    long_note = client.post(
        "/api/transactions",
        json={
            "account_id": 1,
            "category_id": 1,
            "amount": "1.00",
            "transaction_date": "2026-10-01",
            "note": "x" * 121,
        },
    )
    assert long_note.status_code == 422
    assert long_note.json()["error"]["field"] == "note"

    invalid_date = client.get("/api/transactions", params={"month": "2026-13"})
    assert invalid_date.status_code == 422
    assert invalid_date.json()["error"]["code"] == "invalid_field"
    assert invalid_date.json()["error"]["field"] == "month"

    missing_transaction = client.delete("/api/transactions/999")
    assert missing_transaction.status_code == 404
    assert missing_transaction.json()["error"]["code"] == "not_found"

    bank = create_account(client, "Daily Bank", "bank")
    card = create_account(client, "Travel Card", "credit_card", credit_limit="5000.00")
    missing_payment = client.put(
        "/api/credit-card-payments/999",
        json={
            "source_account_id": bank["id"],
            "card_account_id": card["id"],
            "amount": "10.00",
            "payment_date": "2026-10-01",
            "note": None,
        },
    )
    assert missing_payment.status_code == 404

    unknown_route = client.get("/api/not-a-route")
    assert unknown_route.status_code == 404
    assert unknown_route.json() == {"error": {"code": "not_found", "message": "Resource not found."}}

    unsupported_method = client.patch("/api/transactions/1")
    assert unsupported_method.status_code == 405
    assert unsupported_method.json()["error"]["code"] == "method_not_allowed"


def test_current_account_amount_corrections_preserve_history_and_month_totals(client: TestClient) -> None:
    bank = create_account(client, "Correction Bank", "bank", opening_balance="100.00")
    card = create_account(client, "Correction Card", "credit_card", credit_limit="1000.00")
    income = category_id(client, "Salary", "income")
    expense = category_id(client, "Food", "expense")
    create_transaction(client, bank["id"], income, "200.00")
    create_transaction(client, card["id"], expense, "150.00")
    create_payment(client, bank["id"], card["id"], "50.00")
    transfer_account = create_account(client, "Transfer Bank", "bank")
    transfer = client.post("/api/account-transfers", json={
        "source_account_id": bank["id"], "destination_account_id": transfer_account["id"],
        "amount": "25.00", "transfer_date": "2026-10-20", "note": None,
    })
    assert transfer.status_code == 201
    params = {"month": "2026-10"}
    routes = ["transactions", "credit-card-payments", "account-transfers"]
    history = {route: client.get(f"/api/{route}", params=params).json() for route in routes}
    summary = client.get("/api/summary", params=params).json()
    detail = client.get(f"/api/accounts/{bank['id']}").json()
    assert detail["current_balance"] == "225.00"
    assert "opening_balance" not in detail
    payload = {"name": bank["name"], "type": "bank", "current_balance": "0.00", "current_debt": "0.00", "credit_limit": None}
    for target in ["0.00", "-0.05", "1000.00"]:
        payload["current_balance"] = target
        response = client.put(f"/api/accounts/{bank['id']}", json=payload)
        assert response.status_code == 200, response.text
        assert response.json()["balance"] == target
        assert client.get(f"/api/accounts/{bank['id']}").json()["current_balance"] == target
    # Saving a loaded amount again (for example, a rename) must not add the activity twice.
    payload["name"] = "Renamed Bank"
    assert client.put(f"/api/accounts/{bank['id']}", json=payload).json()["balance"] == "1000.00"
    card_payload = {"name": card["name"], "type": "credit_card", "current_balance": "0.00", "current_debt": "0.00", "credit_limit": "1200.00"}
    assert client.get(f"/api/accounts/{card['id']}").json()["current_debt"] == "100.00"
    for target in ["0.00", "-0.05", "123.45"]:
        card_payload["current_debt"] = target
        response = client.put(f"/api/accounts/{card['id']}", json=card_payload)
        assert response.status_code == 200, response.text
        assert response.json()["outstanding_signed_debt"] == target
        assert response.json()["credit_limit"] == "1200.00"
        assert client.get(f"/api/accounts/{card['id']}").json()["current_debt"] == target
    for route in routes:
        assert client.get(f"/api/{route}", params=params).json() == history[route]
    after = client.get("/api/summary", params=params).json()
    assert after["month_income"] == summary["month_income"]
    assert after["month_expenses"] == summary["month_expenses"]


def test_current_account_correction_validation_and_rollback(client: TestClient) -> None:
    bank = create_account(client, "Original Bank", "bank")
    create_account(client, "Taken Name", "cash")
    create_transaction(client, bank["id"], category_id(client, "Salary", "income"), "9999999999.99")
    payload = {"name": bank["name"], "type": "bank", "current_balance": "0.00", "current_debt": "0.00", "credit_limit": None}
    path = f"/api/accounts/{bank['id']}"
    for invalid in [1.25, "0.001", "NaN", "10000000000.00", "--1.00"]:
        assert client.put(path, json={**payload, "current_balance": invalid}).status_code == 422
    assert client.put(path, json={**payload, "type": "cash"}).status_code == 400
    assert client.put(path, json={**payload, "current_debt": "1.00"}).status_code == 400
    assert client.put(path, json={**payload, "name": "Taken Name"}).status_code == 409
    # The target fits NUMERIC, but subtracting existing income would overflow the baseline.
    response = client.put(path, json={**payload, "name": "Must Roll Back", "current_balance": "-0.01"})
    assert response.status_code == 422
    assert response.json()["error"]["field"] == "current_balance"
    unchanged = client.get(path).json()
    assert unchanged["name"] == "Original Bank"
    assert unchanged["current_balance"] == "9999999999.99"
    assert client.put("/api/accounts/999999", json=payload).status_code == 404
