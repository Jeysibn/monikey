from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from database import open_connection

def create_account(client: TestClient, name: str, account_type: str, **fields: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "type": account_type,
        "opening_balance": "0.00",
        "opening_debt": "0.00",
        "credit_limit": None,
    }
    payload.update(fields)
    response = client.post("/api/accounts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def category_id(client: TestClient, name: str, category_type: str) -> int:
    categories = client.get("/api/categories", params={"type": category_type}).json()
    return next(row["id"] for row in categories if row["name"] == name)


def create_transaction(
    client: TestClient,
    account_id: int,
    category_id: int,
    amount: str,
    transaction_date: str,
    envelope: str | None = None,
    include_envelope: bool = True,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "account_id": account_id,
        "category_id": category_id,
        "amount": amount,
        "transaction_date": transaction_date,
        "note": None,
    }
    if include_envelope:
        payload["kakeibo_envelope"] = envelope
    response = client.post("/api/transactions", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def plan_payload(**fields: str) -> dict[str, str]:
    payload = {
        "planned_income": "2000.00",
        "allocated_starting_funds": "100.00",
        "savings_target": "400.00",
        "prior_period_debt_reserve": "200.00",
        "needs_limit": "100.00",
        "wants_limit": "50.00",
        "culture_limit": "0.00",
        "unexpected_limit": "0.00",
        "monthly_intention": "Spend with care.",
    }
    payload.update(fields)
    return payload


def test_month_plan_report_snapshot_and_ledger_invariance(client: TestClient) -> None:
    bank = create_account(client, "Kakeibo Bank", "bank", opening_balance="1000.00")
    cash = create_account(client, "Kakeibo Cash", "cash", opening_balance="100.00")
    card = create_account(
        client,
        "Kakeibo Card",
        "credit_card",
        opening_debt="0.00",
        credit_limit="5000.00",
    )
    salary = category_id(client, "Salary", "income")
    food = category_id(client, "Food", "expense")
    groceries = category_id(client, "Groceries", "expense")

    missing_plan = client.get("/api/kakeibo/months/2024-02")
    assert missing_plan.status_code == 200
    assert missing_plan.json()["plan"] is None
    assert missing_plan.json()["actual_income"] == "0.00"

    income = create_transaction(client, bank["id"], salary, "3000.00", "2024-02-01", include_envelope=False)
    needs = create_transaction(client, card["id"], groceries, "250.00", "2024-02-29", "needs")
    wants = create_transaction(client, bank["id"], food, "80.00", "2024-02-10", "wants")
    unclassified = create_transaction(client, cash["id"], food, "20.00", "2024-02-15", include_envelope=False)
    payment = client.post(
        "/api/credit-card-payments",
        json={
            "source_account_id": bank["id"],
            "card_account_id": card["id"],
            "amount": "100.00",
            "payment_date": "2024-02-20",
            "note": None,
        },
    )
    assert payment.status_code == 201
    transfer = client.post(
        "/api/account-transfers",
        json={
            "source_account_id": bank["id"],
            "destination_account_id": cash["id"],
            "amount": "75.00",
            "transfer_date": "2024-02-21",
            "note": None,
        },
    )
    assert transfer.status_code == 201

    accounts_before_metadata = client.get("/api/accounts").json()
    transactions_before_metadata = client.get("/api/transactions", params={"month": "2024-02"}).json()
    payments_before_metadata = client.get("/api/credit-card-payments", params={"month": "2024-02"}).json()
    transfers_before_metadata = client.get("/api/account-transfers", params={"month": "2024-02"}).json()
    assert len(transactions_before_metadata) == 4

    saved_plan = client.put("/api/kakeibo/months/2024-02", json=plan_payload())
    assert saved_plan.status_code == 200, saved_plan.text
    assert client.get("/api/accounts").json() == accounts_before_metadata
    report = client.get("/api/kakeibo/months/2024-02/report").json()
    assert report["planned_income"] == "2000.00"
    assert report["actual_income"] == "3000.00"
    assert report["available_to_allocate"] == "1500.00"
    assert report["unallocated"] == "1350.00"
    assert report["total_expenses"] == "350.00"
    assert report["unclassified_expenses"] == "20.00"
    assert report["envelopes"] == {
        "needs": {"limit": "100.00", "actual_spent": "250.00", "remaining": "-150.00"},
        "wants": {"limit": "50.00", "actual_spent": "80.00", "remaining": "-30.00"},
        "culture": {"limit": "0.00", "actual_spent": "0.00", "remaining": "0.00"},
        "unexpected": {"limit": "0.00", "actual_spent": "0.00", "remaining": "0.00"},
    }
    assert report["actuals_changed_since_review"] is False

    review = client.put(
        "/api/kakeibo/months/2024-02/review",
        json={
            "actual_saved_declared": "300.00",
            "review_available": "Income covered the plan.",
            "review_savings": "I saved 300 pesos.",
            "review_change": "Reduce wants by 20 pesos.",
            "review_appreciated": "A good meal.",
            "review_surprise": "A repair bill.",
            "review_lesson": "Leave more room for repairs.",
        },
    )
    assert review.status_code == 200, review.text
    assert client.get("/api/accounts").json() == accounts_before_metadata
    assert review.json()["actual_saved_declared"] == "300.00"
    assert review.json()["actuals_changed_since_review"] is False
    snapshot = review.json()["plan"]["review_actuals_snapshot"]
    assert snapshot == {
        "actual_income": "3000.00",
        "total_expenses": "350.00",
        "unclassified": "20.00",
        "envelopes": {
            "needs": "250.00",
            "wants": "80.00",
            "culture": "0.00",
            "unexpected": "0.00",
        },
    }

    # An older client omitting the new field preserves the saved classification.
    update_without_envelope = client.put(
        f"/api/transactions/{needs['id']}",
        json={
            "account_id": card["id"],
            "category_id": groceries,
            "amount": "300.00",
            "transaction_date": "2024-03-01",
            "note": "Updated after closeout",
        },
    )
    assert update_without_envelope.status_code == 200, update_without_envelope.text
    assert update_without_envelope.json()["kakeibo_envelope"] == "needs"

    changed_report = client.get("/api/kakeibo/months/2024-02/report").json()
    assert changed_report["envelopes"]["needs"]["actual_spent"] == "0.00"
    assert changed_report["actuals_changed_since_review"] is True
    assert changed_report["plan"]["review_actuals_snapshot"] == snapshot
    assert changed_report["actual_saved_declared"] == "300.00"

    # The later transaction edit changed its month and amount, but payments and
    # transfers still were not touched by planning or reflection.
    assert client.get("/api/transactions", params={"month": "2024-02"}).json() == [
        row for row in transactions_before_metadata if row["id"] != needs["id"]
    ]
    assert client.get("/api/credit-card-payments", params={"month": "2024-02"}).json() == payments_before_metadata
    assert client.get("/api/account-transfers", params={"month": "2024-02"}).json() == transfers_before_metadata
    assert income["kakeibo_envelope"] is None
    assert wants["kakeibo_envelope"] == "wants"
    assert unclassified["kakeibo_envelope"] is None


def test_month_review_without_plan_stays_separate_from_zero_plan(client: TestClient) -> None:
    review_body = {
        "actual_saved_declared": "0.00",
        "review_available": "No income this month.",
        "review_savings": "I saved nothing.",
        "review_change": "Plan earlier.",
        "review_appreciated": None,
        "review_surprise": None,
        "review_lesson": None,
    }
    saved_review = client.put("/api/kakeibo/months/2026-09/review", json=review_body)
    assert saved_review.status_code == 200, saved_review.text
    response = saved_review.json()
    assert response["plan"] is None
    assert response["plan_status"] == "not_saved"
    assert response["review"]["review_available"] == "No income this month."
    assert response["review"]["actual_saved_declared"] == "0.00"
    assert response["review"]["review_actuals_snapshot"] is not None
    assert response["available_to_allocate"] is None
    assert all(value["limit"] is None for value in response["envelopes"].values())

    zero_plan = {
        "planned_income": "0.00",
        "allocated_starting_funds": "0.00",
        "savings_target": "0.00",
        "prior_period_debt_reserve": "0.00",
        "needs_limit": "0.00",
        "wants_limit": "0.00",
        "culture_limit": "0.00",
        "unexpected_limit": "0.00",
        "monthly_intention": None,
    }
    saved_plan = client.put("/api/kakeibo/months/2026-09", json=zero_plan)
    assert saved_plan.status_code == 200, saved_plan.text
    assert saved_plan.json()["plan_status"] == "saved"
    assert saved_plan.json()["plan"] is not None
    assert saved_plan.json()["plan"]["planned_income"] == "0.00"
    assert saved_plan.json()["review"] == response["review"]
    assert saved_plan.json()["plan"]["review_actuals_snapshot"] == response["review"]["review_actuals_snapshot"]


def test_legacy_plan_presence_is_reported_as_unknown(client: TestClient) -> None:
    with open_connection() as connection:
        connection.execute(
            """
            INSERT INTO kakeibo_month_plans (month, planned_income, needs_limit)
            VALUES ('2026-08-01', 0, 0)
            """
        )

    legacy = client.get("/api/kakeibo/months/2026-08")
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()["plan_status"] == "legacy_unknown"
    assert legacy.json()["plan"] is not None
    assert legacy.json()["plan"]["planned_income"] == "0.00"


def test_category_defaults_are_suggestions_and_income_is_restricted(client: TestClient) -> None:
    bank = create_account(client, "Category Bank", "bank")
    food = category_id(client, "Food", "expense")
    salary = category_id(client, "Salary", "income")
    transaction = create_transaction(client, bank["id"], food, "15.00", "2026-01-02", "wants")

    changed_default = client.patch(
        f"/api/categories/{food}/default-kakeibo-envelope",
        json={"default_kakeibo_envelope": "needs"},
    )
    assert changed_default.status_code == 200
    assert changed_default.json()["default_kakeibo_envelope"] == "needs"
    food_row = next(row for row in client.get("/api/categories").json() if row["id"] == food)
    assert food_row["default_kakeibo_envelope"] == "needs"
    assert client.get("/api/transactions", params={"month": "2026-01"}).json()[0]["kakeibo_envelope"] == "wants"

    # Category defaults do not auto-classify old-client creates.
    old_create = create_transaction(client, bank["id"], food, "10.00", "2026-01-03", include_envelope=False)
    assert old_create["kakeibo_envelope"] is None

    invalid_income_default = client.patch(
        f"/api/categories/{salary}/default-kakeibo-envelope",
        json={"default_kakeibo_envelope": "needs"},
    )
    assert invalid_income_default.status_code == 422
    assert invalid_income_default.json()["error"]["field"] == "default_kakeibo_envelope"
    clear_default = client.patch(
        f"/api/categories/{food}/default-kakeibo-envelope",
        json={"default_kakeibo_envelope": None},
    )
    assert clear_default.status_code == 200
    assert clear_default.json()["default_kakeibo_envelope"] is None

    income_with_envelope = client.post(
        "/api/transactions",
        json={
            "account_id": bank["id"],
            "category_id": salary,
            "amount": "20.00",
            "transaction_date": "2026-01-04",
            "kakeibo_envelope": "needs",
        },
    )
    assert income_with_envelope.status_code == 422
    assert income_with_envelope.json()["error"]["field"] == "kakeibo_envelope"

    invalid_envelope = client.post(
        "/api/transactions",
        json={
            "account_id": bank["id"],
            "category_id": food,
            "amount": "20.00",
            "transaction_date": "2026-01-04",
            "kakeibo_envelope": "other",
        },
    )
    assert invalid_envelope.status_code == 422

    cleared = client.put(
        f"/api/transactions/{transaction['id']}",
        json={
            "account_id": bank["id"],
            "category_id": food,
            "amount": "15.00",
            "transaction_date": "2026-01-02",
            "note": None,
            "kakeibo_envelope": None,
        },
    )
    assert cleared.status_code == 200
    assert cleared.json()["kakeibo_envelope"] is None


def test_weekly_reviews_use_monday_weeks_and_calendar_boundaries(client: TestClient) -> None:
    bank = create_account(client, "Weekly Bank", "bank")
    food = category_id(client, "Food", "expense")
    groceries = category_id(client, "Groceries", "expense")
    create_transaction(client, bank["id"], groceries, "25.00", "2026-02-28", "needs")
    create_transaction(client, bank["id"], food, "30.00", "2026-03-01", "wants")
    create_transaction(client, bank["id"], food, "99.00", "2026-03-02", "culture")

    summary = client.get("/api/kakeibo/weeks/2026-02-23")
    assert summary.status_code == 200
    assert summary.json() == {
        "week_start": "2026-02-23",
        "week_end": "2026-03-01",
        "spending_by_envelope": {"needs": "25.00", "wants": "30.00", "culture": "0.00", "unexpected": "0.00"},
        "unclassified_expenses": "0.00",
        "total_expenses": "55.00",
        "review": None,
    }

    saved = client.put(
        "/api/kakeibo/weeks/2026-02-23",
        json={
            "surprise_note": "The week crossed into March.",
            "worthwhile_note": "Groceries were useful.",
            "next_week_intention": "Plan the commute.",
        },
    )
    assert saved.status_code == 200
    assert saved.json()["review"]["next_week_intention"] == "Plan the commute."
    assert client.put("/api/kakeibo/weeks/2026-02-23", json={"surprise_note": "Updated."}).status_code == 200
    updated_review = client.get("/api/kakeibo/weeks/2026-02-23").json()["review"]
    assert updated_review["surprise_note"] == "Updated."
    assert updated_review["worthwhile_note"] is None
    assert updated_review["next_week_intention"] is None
    assert client.get("/api/kakeibo/weeks/2026-02-24").status_code == 422
    assert client.get("/api/kakeibo/weeks/not-a-date").status_code == 422


def test_transaction_envelope_patch_changes_only_classification(client: TestClient) -> None:
    bank = create_account(client, "Classification Bank", "bank", opening_balance="500.00")
    salary = category_id(client, "Salary", "income")
    food = category_id(client, "Food", "expense")
    expense = create_transaction(client, bank["id"], food, "45.25", "2026-04-12", include_envelope=False)
    income = create_transaction(client, bank["id"], salary, "1200.00", "2026-04-01", include_envelope=False)

    transaction_fields = {"id", "account_id", "category_id", "amount", "transaction_date", "note", "created_at"}
    before_expense = client.get("/api/transactions", params={"month": "2026-04"}).json()
    before_accounts = client.get("/api/accounts").json()
    before_report = client.get("/api/kakeibo/months/2026-04/report").json()
    expense_before = next(row for row in before_expense if row["id"] == expense["id"])
    income_before = next(row for row in before_expense if row["id"] == income["id"])

    classified = client.patch(
        f"/api/transactions/{expense['id']}/kakeibo-envelope",
        json={"kakeibo_envelope": "needs"},
    )
    assert classified.status_code == 200, classified.text
    assert classified.json()["kakeibo_envelope"] == "needs"
    assert {key: classified.json()[key] for key in transaction_fields} == {
        key: expense_before[key] for key in transaction_fields
    }
    income_after = next(
        row
        for row in client.get("/api/transactions", params={"month": "2026-04"}).json()
        if row["id"] == income["id"]
    )
    assert {key: income_after[key] for key in transaction_fields} == {
        key: income_before[key] for key in transaction_fields
    }
    assert client.get("/api/accounts").json() == before_accounts

    after_classification = client.get("/api/kakeibo/months/2026-04/report").json()
    assert after_classification["envelopes"]["needs"]["actual_spent"] == "45.25"
    assert after_classification["unclassified_expenses"] == "0.00"
    assert after_classification["total_expenses"] == before_report["total_expenses"] == "45.25"

    cleared = client.patch(
        f"/api/transactions/{expense['id']}/kakeibo-envelope",
        json={"kakeibo_envelope": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["kakeibo_envelope"] is None
    assert {key: cleared.json()[key] for key in transaction_fields} == {
        key: expense_before[key] for key in transaction_fields
    }
    after_clear = client.get("/api/kakeibo/months/2026-04/report").json()
    assert after_clear["envelopes"]["needs"]["actual_spent"] == "0.00"
    assert after_clear["unclassified_expenses"] == "45.25"
    assert after_clear["total_expenses"] == before_report["total_expenses"]
    assert client.get("/api/accounts").json() == before_accounts

    income_classification = client.patch(
        f"/api/transactions/{income['id']}/kakeibo-envelope",
        json={"kakeibo_envelope": "needs"},
    )
    assert income_classification.status_code == 422
    assert income_classification.json()["error"]["field"] == "kakeibo_envelope"
    income_clear = client.patch(
        f"/api/transactions/{income['id']}/kakeibo-envelope",
        json={"kakeibo_envelope": None},
    )
    assert income_clear.status_code == 422

    missing = client.patch(
        "/api/transactions/999999/kakeibo-envelope",
        json={"kakeibo_envelope": "needs"},
    )
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"
    missing_required_field = client.patch(f"/api/transactions/{expense['id']}/kakeibo-envelope", json={})
    assert missing_required_field.status_code == 422


def test_month_path_money_validation_and_zero_savings_target(client: TestClient) -> None:
    zero_plan = plan_payload(
        planned_income="0.00",
        allocated_starting_funds="0.00",
        savings_target="0.00",
        prior_period_debt_reserve="0.00",
        needs_limit="0.00",
        wants_limit="0.00",
        culture_limit="0.00",
        unexpected_limit="0.00",
    )
    result = client.put("/api/kakeibo/months/2024-02", json=zero_plan)
    assert result.status_code == 200
    assert result.json()["available_to_allocate"] == "0.00"
    assert result.json()["unallocated"] == "0.00"
    assert client.get("/api/kakeibo/months/2026-13").status_code == 422

    negative = client.put(
        "/api/kakeibo/months/2026-10",
        json=plan_payload(savings_target="-1.00"),
    )
    assert negative.status_code == 422
    float_money = client.put(
        "/api/kakeibo/months/2026-10",
        json=plan_payload(planned_income=2000.0),
    )
    assert float_money.status_code == 422
