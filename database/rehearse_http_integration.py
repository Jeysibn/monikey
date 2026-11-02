"""Exercise a fresh Compose stack through its same-origin Nginx API proxy.

The caller must start the project's disposable Compose stack first. The default
URL points at the local, host-only frontend port and all records use fictional
names and values.
"""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPHandler, HTTPRedirectHandler, Request, build_opener


SAFE_TEST_BASE_URL = "http://127.0.0.1:8080/api"
BASE_URL = SAFE_TEST_BASE_URL


class RejectRedirects(HTTPRedirectHandler):
    """Do not let urllib follow a server redirect to another destination."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class DirectHTTPHandler(HTTPHandler):
    """Handle allowed HTTP URLs before urllib's environment proxy handler."""

    handler_order = 0


def validate_local_destination(url: str) -> str:
    """Allow only the local Compose frontend and its same-origin API paths."""
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise ValueError("Integration URL must be the permitted local test destination.") from error

    valid_path = parsed.path == "/" or parsed.path == "/api" or parsed.path.startswith("/api/")
    if (
        parsed.scheme != "http"
        or parsed.netloc != "127.0.0.1:8080"
        or parsed.hostname != "127.0.0.1"
        or port != 8080
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or not valid_path
    ):
        raise ValueError("Integration URL must be the permitted local test destination.")
    return url


def validate_base_url(value: str) -> str:
    """Reject environment overrides unless they exactly name the test stack."""
    if value != SAFE_TEST_BASE_URL:
        raise ValueError(f"MONIKEY_E2E_BASE_URL must be exactly {SAFE_TEST_BASE_URL!r}.")
    return value


def configured_base_url() -> str:
    return validate_base_url(os.environ.get("MONIKEY_E2E_BASE_URL", SAFE_TEST_BASE_URL))


def local_opener():
    # The direct handler runs before urllib's environment-based ProxyHandler.
    return build_opener(DirectHTTPHandler(), RejectRedirects())


def open_local_destination(destination: str | Request, timeout: int = 8):
    url = destination.full_url if isinstance(destination, Request) else destination
    validate_local_destination(url)
    return local_opener().open(destination, timeout=timeout)


def call(method: str, path: str, body: dict[str, object] | None = None, expected: int = 200):
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("API path must be local and relative to the permitted API base.")
    data = None if body is None else json.dumps(body).encode()
    request = Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with open_local_destination(request, timeout=8) as response:
            status, raw = response.status, response.read()
    except HTTPError as error:
        status, raw = error.code, error.read()
    if status != expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {raw.decode()}")
    return json.loads(raw) if raw else None


def account(name: str, kind: str, **extra: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": name,
        "type": kind,
        "opening_balance": "0.00",
        "opening_debt": "0.00",
        "credit_limit": None,
    }
    payload.update(extra)
    return call("POST", "/accounts", payload, 201)


def create_transaction(
    account_id: int,
    category_id: int,
    amount: str,
    day: str,
    envelope: str | None = None,
    *,
    omit_envelope: bool = False,
    note: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "account_id": account_id,
        "category_id": category_id,
        "amount": amount,
        "transaction_date": day,
        "note": note,
    }
    if not omit_envelope:
        payload["kakeibo_envelope"] = envelope
    return call("POST", "/transactions", payload, 201)


def main() -> None:
    global BASE_URL
    BASE_URL = configured_base_url()
    assert call("GET", "/health/ready")["status"] == "ok"
    page = open_local_destination(BASE_URL.removesuffix("/api") + "/", timeout=8).read().decode()
    assert '<div id="root"></div>' in page and "assets/index-" in page
    assert call("GET", "/accounts") == []

    bank = account("E2E Bank", "bank", opening_balance="1000.00")
    cash = account("E2E Cash", "cash", opening_balance="200.00")
    card = account("E2E Card", "credit_card", opening_debt="100.00", credit_limit="5000.00")
    categories = call("GET", "/categories")

    def category_id(name: str, kind: str) -> int:
        return next(row["id"] for row in categories if row["name"] == name and row["type"] == kind)

    salary, food, groceries = category_id("Salary", "income"), category_id("Food", "expense"), category_id("Groceries", "expense")
    income = create_transaction(bank["id"], salary, "3000.00", "2026-12-01", omit_envelope=True, note="Synthetic salary")
    cash_expense = create_transaction(cash["id"], food, "40.00", "2026-12-31", omit_envelope=True, note="Synthetic cash meal")
    card_purchase = create_transaction(card["id"], groceries, "60.00", "2027-01-01", omit_envelope=True, note="Synthetic card purchase")
    historical = create_transaction(bank["id"], food, "25.00", "2026-12-30", omit_envelope=True, note="Synthetic historical meal")
    call("POST", "/credit-card-payments", {
        "source_account_id": bank["id"], "card_account_id": card["id"], "amount": "10.00",
        "payment_date": "2027-01-02", "note": "Synthetic payment",
    }, 201)
    call("POST", "/account-transfers", {
        "source_account_id": cash["id"], "destination_account_id": bank["id"], "amount": "15.00",
        "transfer_date": "2027-01-03", "note": "Synthetic transfer",
    }, 201)

    def ledger_counts() -> tuple[int, int, int]:
        return (
            len(call("GET", "/transactions?month=2026-12")),
            len(call("GET", "/credit-card-payments?month=2027-01")),
            len(call("GET", "/account-transfers?month=2027-01")),
        )

    position_before_metadata = call("GET", "/accounts")
    counts_before = ledger_counts()
    assert call("GET", "/kakeibo/months/2026-12")["plan_status"] == "not_saved"

    plan: dict[str, object] = {
        "planned_income": "1000.00", "allocated_starting_funds": "50.00", "savings_target": "100.00",
        "prior_period_debt_reserve": "25.00", "needs_limit": "10.00", "wants_limit": "10.00",
        "culture_limit": "0.00", "unexpected_limit": "0.00", "monthly_intention": "Use what I have.",
    }
    assert call("PUT", "/kakeibo/months/2026-12", plan)["plan_status"] == "saved"
    plan["needs_limit"] = "5.00"
    assert call("PUT", "/kakeibo/months/2026-12", plan)["plan"]["needs_limit"] == "5.00"

    zero_plan: dict[str, object] = {
        field: "0.00" for field in (
            "planned_income", "allocated_starting_funds", "savings_target", "prior_period_debt_reserve",
            "needs_limit", "wants_limit", "culture_limit", "unexpected_limit",
        )
    }
    zero_plan["monthly_intention"] = None
    assert call("PUT", "/kakeibo/months/2027-02", zero_plan)["plan_status"] == "saved"
    assert call("GET", "/kakeibo/months/2027-02")["plan"] is not None

    call("PATCH", f"/categories/{food}/default-kakeibo-envelope", {"default_kakeibo_envelope": "needs"})
    for transaction, envelope in ((cash_expense, "needs"), (card_purchase, "wants"), (historical, "culture")):
        saved = call("PATCH", f"/transactions/{transaction['id']}/kakeibo-envelope", {"kakeibo_envelope": envelope})
        for field in ("amount", "account_id", "category_id", "transaction_date", "note"):
            assert saved[field] == transaction[field], (field, saved, transaction)

    december = call("GET", "/kakeibo/months/2026-12/report")
    january = call("GET", "/kakeibo/months/2027-01/report")
    assert december["actual_income"] == "3000.00" and december["total_expenses"] == "65.00"
    assert december["envelopes"]["needs"]["actual_spent"] == "40.00"
    assert december["envelopes"]["culture"]["actual_spent"] == "25.00"
    assert january["total_expenses"] == "60.00" and january["envelopes"]["wants"]["actual_spent"] == "60.00"
    assert december["envelopes"]["needs"]["remaining"] == "-35.00"
    assert call("PATCH", f"/transactions/{cash_expense['id']}/kakeibo-envelope", {"kakeibo_envelope": None})["kakeibo_envelope"] is None
    assert call("GET", "/kakeibo/months/2026-12/report")["unclassified_expenses"] == "40.00"
    call("PATCH", f"/transactions/{cash_expense['id']}/kakeibo-envelope", {"kakeibo_envelope": "unexpected"})

    week = call("GET", "/kakeibo/weeks/2026-12-28")
    assert week["week_end"] == "2027-01-03" and week["total_expenses"] == "125.00"
    call("PUT", "/kakeibo/weeks/2026-12-28", {
        "surprise_note": "Crossed year end", "worthwhile_note": "Card purchase was useful", "next_week_intention": "Review early",
    })
    replaced = call("PUT", "/kakeibo/weeks/2026-12-28", {"surprise_note": "Edited"})["review"]
    assert replaced["surprise_note"] == "Edited"
    assert replaced["worthwhile_note"] is None and replaced["next_week_intention"] is None

    review = {
        "actual_saved_declared": "0.00", "review_available": "No plan was made.", "review_savings": "None declared.",
        "review_change": "Start sooner.", "review_appreciated": "", "review_surprise": "", "review_lesson": "",
    }
    review_only = call("PUT", "/kakeibo/months/2027-03/review", review)
    assert review_only["plan_status"] == "not_saved" and review_only["plan"] is None
    assert review_only["review"]["review_available"] == "No plan was made."
    old_snapshot = review_only["review"]["review_actuals_snapshot"]
    assert call("PUT", "/kakeibo/months/2027-03", zero_plan)["review"]["review_actuals_snapshot"] == old_snapshot

    closeout = {
        "actual_saved_declared": "150.00", "review_available": "Review after plan.", "review_savings": "Set aside 150.",
        "review_change": "Keep needs below 50.", "review_appreciated": "A shared meal.",
        "review_surprise": "Higher groceries.", "review_lesson": "Plan food.",
    }
    first_review = call("PUT", "/kakeibo/months/2026-12/review", closeout)
    snapshot = first_review["plan"]["review_actuals_snapshot"]
    call("PUT", f"/transactions/{cash_expense['id']}", {
        "account_id": cash["id"], "category_id": food, "amount": "45.00", "transaction_date": "2026-12-31",
        "note": "Synthetic cash meal edited", "kakeibo_envelope": "unexpected",
    })
    changed = call("GET", "/kakeibo/months/2026-12/report")
    assert changed["actuals_changed_since_review"] is True
    assert changed["plan"]["review_actuals_snapshot"] == snapshot
    closeout["review_available"] = "Updated after edit."
    refreshed = call("PUT", "/kakeibo/months/2026-12/review", closeout)
    assert refreshed["actuals_changed_since_review"] is False
    assert refreshed["plan"]["review_actuals_snapshot"] != snapshot

    assert call("GET", "/kakeibo/weeks/2026-12-29", expected=422)["error"]["code"]
    assert call("PATCH", f"/transactions/{income['id']}/kakeibo-envelope", {"kakeibo_envelope": "needs"}, expected=422)["error"]["field"] == "kakeibo_envelope"
    assert call("PATCH", "/transactions/999999/kakeibo-envelope", {"kakeibo_envelope": "needs"}, expected=404)["error"]["code"] == "not_found"

    temporary = create_transaction(cash["id"], food, "5.00", "2026-12-15", "needs")
    call("PUT", f"/transactions/{temporary['id']}", {
        "account_id": cash["id"], "category_id": food, "amount": "7.00", "transaction_date": "2026-12-15",
        "note": "Edited then deleted", "kakeibo_envelope": "wants",
    })
    call("DELETE", f"/transactions/{temporary['id']}", expected=204)
    positions_after_ledger = call("GET", "/accounts")
    counts_after_ledger = ledger_counts()
    call("PUT", "/kakeibo/months/2026-12", plan)
    call("PATCH", f"/categories/{food}/default-kakeibo-envelope", {"default_kakeibo_envelope": "culture"})
    call("PUT", "/kakeibo/weeks/2026-12-28", {})
    assert call("GET", "/accounts") == positions_after_ledger
    assert ledger_counts() == counts_after_ledger
    assert counts_before == (3, 1, 1)

    print("HTTP integration passed through built React/Nginx and FastAPI: plan/zero/over-budget, expense classification and clearing, category suggestions, card payment/transfer exclusion, cross-year week, monthly reflections and snapshots, validation errors, ledger CRUD, and balance invariance.")
    print("Account positions before metadata writes:", json.dumps(position_before_metadata, sort_keys=True))
    print("Account positions after ledger CRUD and metadata checks:", json.dumps(positions_after_ledger, sort_keys=True))


if __name__ == "__main__":
    main()
