from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient


FIXTURE_DIR = Path(__file__).resolve().parents[2] / "docs" / "api-fixtures"


def fixture(name: str) -> Any:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def post_account(client: TestClient, payload: dict[str, Any]) -> dict[str, Any]:
    response = client.post("/api/accounts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def assert_timestamped_row(actual: dict[str, Any], expected: dict[str, Any]) -> None:
    actual_fields = {key: value for key, value in actual.items() if key != "created_at"}
    expected_fields = {key: value for key, value in expected.items() if key != "created_at"}
    assert actual_fields == expected_fields
    assert re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z",
        actual["created_at"],
    )


def test_shared_fixtures_cover_health_and_account_creation(client: TestClient) -> None:
    assert client.get("/api/health/live").json() == fixture("health-live.json")
    assert client.get("/api/health/ready").json() == fixture("health-ready.json")
    assert client.get("/api/accounts").json() == fixture("accounts-empty.json")

    created_account = post_account(
        client,
        {
            "name": "Test Bank",
            "type": "bank",
            "opening_balance": "1250.00",
            "opening_debt": "0.00",
            "credit_limit": None,
        },
    )
    assert created_account == fixture("account-created.json")


def test_shared_response_fixtures_match_all_financial_reads(client: TestClient) -> None:
    wallet = post_account(
        client,
        {
            "name": "Test Wallet",
            "type": "ewallet",
            "opening_balance": "250.00",
            "opening_debt": "0.00",
            "credit_limit": None,
        },
    )
    overpaid_card = post_account(
        client,
        {
            "name": "Test Overpaid Card",
            "type": "credit_card",
            "opening_balance": "0.00",
            "opening_debt": "100.00",
            "credit_limit": "5000.00",
        },
    )
    over_limit_card = post_account(
        client,
        {
            "name": "Test Over-limit Card",
            "type": "credit_card",
            "opening_balance": "0.00",
            "opening_debt": "5200.00",
            "credit_limit": "5000.00",
        },
    )

    categories = client.get("/api/categories")
    assert categories.json() == fixture("categories-list.json")
    food_id = next(row["id"] for row in categories.json() if row["name"] == "Food")

    transaction = client.post(
        "/api/transactions",
        json={
            "account_id": wallet["id"],
            "category_id": food_id,
            "amount": "110.25",
            "transaction_date": "2026-10-15",
            "note": "Synthetic expense",
        },
    )
    assert transaction.status_code == 201
    assert_timestamped_row(transaction.json(), fixture("transaction-created.json"))

    payment = client.post(
        "/api/credit-card-payments",
        json={
            "source_account_id": wallet["id"],
            "card_account_id": overpaid_card["id"],
            "amount": "150.00",
            "payment_date": "2026-10-20",
            "note": "Synthetic card payment",
        },
    )
    assert payment.status_code == 201
    assert_timestamped_row(payment.json(), fixture("payment-created.json"))

    assert client.get("/api/accounts").json() == fixture("accounts-list.json")
    assert client.get("/api/summary", params={"month": "2026-10"}).json() == fixture("summary-month.json")
    assert client.get("/api/summary", params={"month": "2026-09"}).json() == fixture("summary-empty-month.json")

    transactions = client.get("/api/transactions", params={"month": "2026-10"}).json()
    assert len(transactions) == 1
    assert_timestamped_row(transactions[0], fixture("transactions-list.json")[0])
    assert client.get("/api/transactions", params={"month": "2026-09"}).json() == fixture("transactions-empty-month.json")

    payments = client.get("/api/credit-card-payments", params={"month": "2026-10"}).json()
    assert len(payments) == 1
    assert_timestamped_row(payments[0], fixture("payments-list.json")[0])
    assert client.get("/api/credit-card-payments", params={"month": "2026-09"}).json() == fixture("payments-empty-month.json")

    updated_transaction = client.put(
        f"/api/transactions/{transaction.json()['id']}",
        json={
            "account_id": wallet["id"],
            "category_id": food_id,
            "amount": "120.50",
            "transaction_date": "2026-10-16",
            "note": "Updated synthetic expense",
        },
    )
    assert updated_transaction.status_code == 200
    assert_timestamped_row(updated_transaction.json(), fixture("transaction-updated.json"))

    updated_payment = client.put(
        f"/api/credit-card-payments/{payment.json()['id']}",
        json={
            "source_account_id": wallet["id"],
            "card_account_id": overpaid_card["id"],
            "amount": "175.00",
            "payment_date": "2026-10-21",
            "note": "Updated synthetic payment",
        },
    )
    assert updated_payment.status_code == 200
    assert_timestamped_row(updated_payment.json(), fixture("payment-updated.json"))

    assert over_limit_card["id"] == 3
    assert client.delete(f"/api/transactions/{transaction.json()['id']}").status_code == 204
    assert client.delete(f"/api/credit-card-payments/{payment.json()['id']}").status_code == 204


def test_shared_error_fixtures_match_api_errors(client: TestClient) -> None:
    invalid_request = client.post(
        "/api/accounts",
        json={
            "name": "Malformed",
            "type": "cash",
            "opening_balance": 12.5,
            "opening_debt": "0.00",
            "credit_limit": None,
        },
    )
    assert invalid_request.status_code == 422
    assert invalid_request.json() == fixture("error-invalid-field.json")

    card = post_account(
        client,
        {
            "name": "Test Card",
            "type": "credit_card",
            "opening_debt": "0.00",
            "credit_limit": "5000.00",
        },
    )
    income = next(row for row in client.get("/api/categories").json() if row["name"] == "Salary")
    invalid_type = client.post(
        "/api/transactions",
        json={
            "account_id": card["id"],
            "category_id": income["id"],
            "amount": "10.00",
            "transaction_date": "2026-10-01",
            "note": None,
        },
    )
    assert invalid_type.status_code == 400
    assert invalid_type.json() == fixture("error-invalid-account-type.json")

    missing = client.delete("/api/transactions/999")
    assert missing.status_code == 404
    assert missing.json() == fixture("error-not-found.json")

    duplicate = client.post(
        "/api/accounts",
        json={
            "name": "  TEST CARD ",
            "type": "credit_card",
            "opening_debt": "0.00",
            "credit_limit": "5000.00",
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json() == fixture("error-duplicate-account-name.json")
