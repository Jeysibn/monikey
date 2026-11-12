"""One synthetic month driven through every money-moving endpoint, checked against hand-computed figures.

The invariants under test: a card purchase is an expense and raises debt; a card payment lowers debt and the
paying account but is NOT an expense; a transfer moves money between accounts and is neither income nor an
expense. Nothing is counted twice, and every figure survives an edit and a delete.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient

from test_api import category_id, create_account, create_payment, create_transaction
from test_activity_filters import transfer

MONTH = "2026-09"
RANGE = {"start_date": "2026-09-01", "end_date": "2026-09-30"}


def money(value: str) -> Decimal:
    return Decimal(value)


def accounts_by_name(client: TestClient) -> dict[str, dict[str, Any]]:
    return {row["name"]: row for row in client.get("/api/accounts").json()}


def summary(client: TestClient) -> dict[str, str]:
    return client.get("/api/summary", params={"month": MONTH}).json()


def check_invariants(client: TestClient, *, balances: dict[str, str], owed: str, income: str, expenses: str) -> None:
    accounts = accounts_by_name(client)
    for name, expected in balances.items():
        assert money(accounts[name]["balance"]) == money(expected), f"{name} balance"
    card = accounts["Mono Card"]
    assert money(card["owed"]) == money(owed), "card debt"
    totals = summary(client)
    assert money(totals["liquid_balance"]) == sum(money(v) for v in balances.values())
    assert money(totals["outstanding_debt"]) == money(owed)
    assert money(totals["net_position"]) == money(totals["liquid_balance"]) - money(owed)
    assert money(totals["month_income"]) == money(income)
    assert money(totals["month_expenses"]) == money(expenses)
    analytics = client.get("/api/analytics", params={**RANGE, "detail": "true"}).json()
    assert money(analytics["totals"]["income"]) == money(income)
    assert money(analytics["totals"]["expenses"]) == money(expenses)
    assert money(analytics["totals"]["net_cash_flow"]) == money(income) - money(expenses)
    assert money(analytics["months"][0]["income"]) == money(income)
    report = client.get(f"/api/kakeibo/months/{MONTH}/report").json()
    assert money(report["actual_income"]) == money(income)
    assert money(report["total_expenses"]) == money(expenses)


def test_purchases_payments_and_transfers_are_never_double_counted(client: TestClient) -> None:
    cash = create_account(client, "Mono Cash", "cash", opening_balance="1000.00")["id"]
    bank = create_account(client, "Mono Bank", "bank", opening_balance="5000.00")["id"]
    wallet = create_account(client, "Mono Wallet", "ewallet", opening_balance="200.00")["id"]
    card = create_account(client, "Mono Card", "credit_card", credit_limit="10000.00")["id"]
    salary = category_id(client, "Salary", "income")
    food = category_id(client, "Food", "expense")
    bills = category_id(client, "Bills", "expense")

    create_transaction(client, bank, salary, "3000.00", "2026-09-01", "pay")
    cash_expense = create_transaction(client, cash, food, "400.00", "2026-09-02", "lunch")
    create_transaction(client, card, food, "1200.00", "2026-09-03", "card dinner")
    card_bill = create_transaction(client, card, bills, "300.00", "2026-09-04", "card bill")
    check_invariants(client, balances={"Mono Cash": "600.00", "Mono Bank": "8000.00", "Mono Wallet": "200.00"},
                     owed="1500.00", income="3000.00", expenses="1900.00")

    payment = create_payment(client, bank, card, "700.00", "2026-09-10")
    # The payment lowers debt and the bank, and adds no expense: expenses stay at 1,900.
    check_invariants(client, balances={"Mono Cash": "600.00", "Mono Bank": "7300.00", "Mono Wallet": "200.00"},
                     owed="800.00", income="3000.00", expenses="1900.00")

    to_cash = transfer(client, bank, cash, "500.00", "2026-09-11")
    to_wallet = transfer(client, bank, wallet, "250.00", "2026-09-12")
    # Transfers move money: total liquid money is unchanged, and neither income nor expenses moved.
    check_invariants(client, balances={"Mono Cash": "1100.00", "Mono Bank": "6550.00", "Mono Wallet": "450.00"},
                     owed="800.00", income="3000.00", expenses="1900.00")

    # Editing an expense changes exactly that expense; the card payment and transfers are untouched.
    edited = client.put(f"/api/transactions/{cash_expense['id']}", json={**{k: cash_expense[k] for k in ("account_id", "category_id", "transaction_date", "note")}, "amount": "500.00"})
    assert edited.status_code == 200, edited.text
    check_invariants(client, balances={"Mono Cash": "1000.00", "Mono Bank": "6550.00", "Mono Wallet": "450.00"},
                     owed="800.00", income="3000.00", expenses="2000.00")

    # Deleting a card purchase lowers debt and expenses together; deleting the payment raises debt, not expenses.
    assert client.delete(f"/api/transactions/{card_bill['id']}").status_code == 204
    check_invariants(client, balances={"Mono Cash": "1000.00", "Mono Bank": "6550.00", "Mono Wallet": "450.00"},
                     owed="500.00", income="3000.00", expenses="1700.00")
    assert client.delete(f"/api/credit-card-payments/{payment['id']}").status_code == 204
    check_invariants(client, balances={"Mono Cash": "1000.00", "Mono Bank": "7250.00", "Mono Wallet": "450.00"},
                     owed="1200.00", income="3000.00", expenses="1700.00")

    # Removing both transfers puts the original money back exactly where it started.
    assert client.delete(f"/api/account-transfers/{to_cash['id']}").status_code == 204
    assert client.delete(f"/api/account-transfers/{to_wallet['id']}").status_code == 204
    check_invariants(client, balances={"Mono Cash": "500.00", "Mono Bank": "8000.00", "Mono Wallet": "200.00"},
                     owed="1200.00", income="3000.00", expenses="1700.00")


def test_overpaying_a_card_is_credit_not_negative_expense_and_paying_does_not_change_the_month(client: TestClient) -> None:
    bank = create_account(client, "Mono Bank", "bank", opening_balance="2000.00")["id"]
    card = create_account(client, "Mono Card", "credit_card", credit_limit="5000.00")["id"]
    food = category_id(client, "Food", "expense")
    create_transaction(client, card, food, "300.00", "2026-09-05")
    create_payment(client, bank, card, "350.00", "2026-09-06")
    accounts = accounts_by_name(client)
    assert money(accounts["Mono Card"]["owed"]) == 0 and money(accounts["Mono Card"]["credit"]) == 50
    assert money(accounts["Mono Bank"]["balance"]) == 1650
    totals = summary(client)
    assert (money(totals["card_credit"]), money(totals["outstanding_debt"]), money(totals["month_expenses"])) == (50, 0, 300)
    assert money(totals["net_position"]) == 1650 + 50


def test_kakeibo_classification_and_review_follow_the_ledger_without_changing_it(client: TestClient) -> None:
    bank = create_account(client, "Mono Bank", "bank", opening_balance="9000.00")["id"]
    food = category_id(client, "Food", "expense")
    salary = category_id(client, "Salary", "income")
    create_transaction(client, bank, salary, "4000.00", "2026-09-01")
    needs = create_transaction(client, bank, food, "600.00", "2026-09-02")
    create_transaction(client, bank, food, "150.00", "2026-09-03")
    before = (accounts_by_name(client)["Mono Bank"]["balance"], summary(client))

    plan = client.put(f"/api/kakeibo/months/{MONTH}", json={
        "planned_income": "4000.00", "allocated_starting_funds": "0.00", "savings_target": "500.00", "prior_period_debt_reserve": "0.00",
        "needs_limit": "1000.00", "wants_limit": "500.00", "culture_limit": "0.00", "unexpected_limit": "0.00", "monthly_intention": "synthetic"})
    assert plan.status_code == 200, plan.text
    assert client.patch(f"/api/transactions/{needs['id']}/kakeibo-envelope", json={"kakeibo_envelope": "needs"}).status_code == 200
    report = client.get(f"/api/kakeibo/months/{MONTH}/report").json()
    assert money(report["envelopes"]["needs"]["actual_spent"]) == 600
    assert money(report["unclassified_expenses"]) == 150  # classified + unclassified always add up to the ledger's expenses
    assert money(report["total_expenses"]) == 750
    assert money(report["available_to_allocate"]) == 4000 - 500
    assert money(report["unallocated"]) == 3500 - 1500
    week = client.put("/api/kakeibo/weeks/2026-08-31", json={"surprise_note": "synthetic", "worthwhile_note": "synthetic", "next_week_intention": "synthetic"})
    assert week.status_code == 200, week.text
    month = client.put(f"/api/kakeibo/months/{MONTH}/review", json={"actual_saved_declared": "100.00", "review_available": "synthetic", "review_savings": None, "review_change": None, "review_appreciated": None, "review_surprise": None, "review_lesson": None})
    assert month.status_code == 200, month.text
    # Planning, classifying and reviewing are metadata: balances and the summary are exactly what they were.
    assert (accounts_by_name(client)["Mono Bank"]["balance"], summary(client)) == before


def test_category_appearance_archive_and_delete_never_touch_history(client: TestClient) -> None:
    bank = create_account(client, "Mono Bank", "bank", opening_balance="1000.00")["id"]
    made = client.post("/api/categories", json={"name": "Synthetic hobby", "type": "expense", "icon_key": "coffee", "color_key": "teal", "default_kakeibo_envelope": "wants"})
    assert made.status_code == 201, made.text
    category = made.json()
    assert (category["icon_key"], category["color_key"], category["default_kakeibo_envelope"]) == ("coffee", "teal", "wants")
    create_transaction(client, bank, category["id"], "120.00", "2026-09-07", "kept")
    before = (accounts_by_name(client)["Mono Bank"]["balance"], summary(client))
    assert client.delete(f"/api/categories/{category['id']}").status_code in (409, 422), "a used category must not be deletable"
    assert client.patch(f"/api/categories/{category['id']}/archive", json={"is_archived": True}).status_code == 200
    assert (accounts_by_name(client)["Mono Bank"]["balance"], summary(client)) == before
    listed = next(row for row in client.get("/api/categories", params={"type": "expense", "status": "archived"}).json() if row["id"] == category["id"])
    assert (listed["is_archived"], listed["usage_count"], listed["icon_key"], listed["color_key"]) == (True, 1, "coffee", "teal")
    assert client.patch(f"/api/categories/{category['id']}/archive", json={"is_archived": False}).status_code == 200
    unused = client.post("/api/categories", json={"name": "Synthetic unused", "type": "expense"}).json()
    assert client.delete(f"/api/categories/{unused['id']}").status_code == 204
