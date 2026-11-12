"""Dashboard analytics: monthly KPI fields and the opt-in day-level sections (ADR-025)."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from test_api import category_id, create_account, create_payment, create_transaction


def analytics(client: TestClient, start: str, end: str, **extra: object) -> dict:
    response = client.get("/api/analytics", params={"start_date": start, "end_date": end, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def seed(client: TestClient) -> dict[str, int]:
    bank = create_account(client, "Detail Bank", "bank")
    card = create_account(client, "Detail Card", "credit_card", credit_limit="9000.00")
    return {
        "bank": bank["id"], "card": card["id"],
        "salary": category_id(client, "Salary", "income"),
        "food": category_id(client, "Food", "expense"),
        "bills": category_id(client, "Bills", "expense"),
    }


def test_month_rows_report_surplus_ratio_and_whether_the_range_covers_the_month(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["salary"], "200.00", "2020-09-05")
    create_transaction(client, ids["bank"], ids["food"], "50.00", "2020-09-06")
    create_transaction(client, ids["bank"], ids["food"], "30.00", "2020-10-04")  # October has expenses but no income
    body = analytics(client, "2020-09-01", "2020-10-15")
    september, october = body["months"]
    assert september == {"month": "2020-09", "income": "200.00", "expenses": "50.00", "surplus": "150.00", "expense_to_income_percent": "25.0", "complete": True}
    assert october["surplus"] == "-30.00"  # a deficit is a plain negative number
    assert october["expense_to_income_percent"] is None  # no income: not infinity, not zero
    assert october["complete"] is False  # the range stops on the 15th: month-to-date, not a whole month


def test_expense_ratio_rounds_half_up_to_one_decimal(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["salary"], "8.00", "2020-10-02")
    create_transaction(client, ids["bank"], ids["food"], "1.00", "2020-10-02")  # 12.5 exactly
    create_transaction(client, ids["bank"], ids["salary"], "3.00", "2020-11-02")
    create_transaction(client, ids["bank"], ids["food"], "1.00", "2020-11-02")  # 33.333...
    october, november = analytics(client, "2020-10-01", "2020-11-30")["months"]
    assert october["expense_to_income_percent"] == "12.5"
    assert november["expense_to_income_percent"] == "33.3"


def test_daily_series_has_every_date_including_zero_spend_days(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "10.00", "2020-10-02")
    create_transaction(client, ids["bank"], ids["food"], "5.50", "2020-10-02")
    create_transaction(client, ids["bank"], ids["salary"], "999.00", "2020-10-03")  # income never counts as spending
    body = analytics(client, "2020-10-01", "2020-10-05", detail="true")
    assert [row["date"] for row in body["daily"]] == ["2020-10-01", "2020-10-02", "2020-10-03", "2020-10-04", "2020-10-05"]
    assert [row["expenses"] for row in body["daily"]] == ["0.00", "15.50", "0.00", "0.00", "0.00"]
    assert sum(Decimal(row["expenses"]) for row in body["daily"]) == Decimal(body["totals"]["expenses"])


def test_daily_kakeibo_breakdown_adds_up_and_keeps_unclassified(client: TestClient) -> None:
    ids = seed(client)
    for amount, envelope in (("10.00", "needs"), ("4.00", "wants"), ("3.00", "culture"), ("2.00", "unexpected"), ("1.25", None)):
        response = client.post("/api/transactions", json={
            "account_id": ids["bank"], "category_id": ids["bills"], "amount": amount,
            "transaction_date": "2020-10-02", "kakeibo_envelope": envelope,
        })
        assert response.status_code == 201, response.text
    day = analytics(client, "2020-10-02", "2020-10-02", detail="true")["daily"][0]
    assert (day["needs"], day["wants"], day["culture"], day["unexpected"], day["unclassified"]) == ("10.00", "4.00", "3.00", "2.00", "1.25")
    assert sum(Decimal(day[k]) for k in ("needs", "wants", "culture", "unexpected", "unclassified")) == Decimal(day["expenses"])  # unclassified is spending


def test_weekday_averages_divide_by_how_often_the_weekday_occurs_zero_days_included(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "0.01", "2020-10-01")  # Thursday; Thursdays in range: 1 and 8
    create_transaction(client, ids["bank"], ids["food"], "9.00", "2020-10-02")  # Friday; one Friday in range
    body = analytics(client, "2020-10-01", "2020-10-08", detail="true")
    by_day = {row["weekday"]: row for row in body["weekdays"]}
    assert [row["weekday"] for row in body["weekdays"]] == [1, 2, 3, 4, 5, 6, 7]  # Monday first, ISO numbers
    assert by_day[4] == {"weekday": 4, "total": "0.01", "occurrences": 2, "average": "0.01"}  # 0.005 rounds half UP, not to even
    assert by_day[5] == {"weekday": 5, "total": "9.00", "occurrences": 1, "average": "9.00"}
    assert by_day[1]["occurrences"] == 1 and by_day[1]["average"] == "0.00"  # Monday 5th: elapsed, nothing spent
    assert sum(row["occurrences"] for row in body["weekdays"]) == len(body["daily"]) == 8


def test_weekday_occurrences_over_a_full_month(client: TestClient) -> None:
    seed(client)
    body = analytics(client, "2020-10-01", "2020-10-31", detail="true")  # starts on a Thursday
    occurrences = {row["weekday"]: row["occurrences"] for row in body["weekdays"]}
    assert occurrences == {1: 4, 2: 4, 3: 4, 4: 5, 5: 5, 6: 5, 7: 4}


def test_insights_are_computed_from_expenses_only(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "20.00", "2020-10-03")
    create_transaction(client, ids["bank"], ids["bills"], "20.00", "2020-10-01")  # ties with the 3rd: the earlier date wins
    create_transaction(client, ids["bank"], ids["food"], "10.00", "2020-10-04")
    create_transaction(client, ids["bank"], ids["salary"], "500.00", "2020-10-02")
    insights = analytics(client, "2020-10-01", "2020-10-05", detail="true")["insights"]
    assert insights == {
        "days": 5, "average_daily_spending": "10.00", "expense_transactions": 3,
        "highest_day": {"date": "2020-10-01", "expenses": "20.00"}, "zero_spend_days": 2,
    }


def test_an_empty_range_has_honest_empty_insights(client: TestClient) -> None:
    seed(client)
    body = analytics(client, "2020-10-01", "2020-10-03", detail="true")
    assert body["insights"] == {"days": 3, "average_daily_spending": "0.00", "expense_transactions": 0, "highest_day": None, "zero_spend_days": 3}
    assert all(row["expenses"] == "0.00" for row in body["daily"])
    assert body["totals"] == {"income": "0.00", "expenses": "0.00", "net_cash_flow": "0.00"}
    assert body["categories"] == []


def test_card_purchases_count_once_while_payments_and_transfers_never_do(client: TestClient) -> None:
    ids = seed(client)
    cash = create_account(client, "Detail Cash", "cash")
    create_transaction(client, ids["card"], ids["food"], "40.00", "2020-10-02")  # a purchase on a card is an expense
    create_payment(client, ids["bank"], ids["card"], "40.00", "2020-10-03")  # paying the card is not another expense
    transfer = client.post("/api/account-transfers", json={"source_account_id": ids["bank"], "destination_account_id": cash["id"], "amount": "25.00", "transfer_date": "2020-10-03"})
    assert transfer.status_code == 201, transfer.text
    body = analytics(client, "2020-10-01", "2020-10-05", detail="true")
    assert body["totals"]["expenses"] == "40.00"
    assert [row["expenses"] for row in body["daily"]] == ["0.00", "40.00", "0.00", "0.00", "0.00"]
    assert body["insights"]["expense_transactions"] == 1
    by_card = analytics(client, "2020-10-01", "2020-10-05", detail="true", account_id=ids["card"])
    assert by_card["totals"]["expenses"] == "40.00"
    assert analytics(client, "2020-10-01", "2020-10-05", detail="true", account_id=cash["id"])["insights"]["expense_transactions"] == 0  # an account with no activity


def test_archived_categories_stay_in_the_history(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["food"], "12.00", "2020-10-02")
    assert client.patch(f"/api/categories/{ids['food']}/archive", json={"is_archived": True}).status_code == 200
    body = analytics(client, "2020-10-01", "2020-10-03", detail="true")
    assert body["categories"][0]["archived"] is True and body["categories"][0]["expenses"] == "12.00"
    assert body["daily"][1]["expenses"] == "12.00"


def test_future_end_dates_are_rejected_but_today_is_fine(client: TestClient) -> None:
    today = datetime.now(ZoneInfo("Asia/Manila")).date()
    assert client.get("/api/analytics", params={"start_date": today.isoformat(), "end_date": today.isoformat()}).status_code == 200
    tomorrow = today + timedelta(days=1)
    response = client.get("/api/analytics", params={"start_date": today.isoformat(), "end_date": tomorrow.isoformat()})
    assert response.status_code == 422
    assert response.json()["error"] == {"code": "invalid_field", "message": "End date cannot be in the future.", "field": "end_date"}


@pytest.mark.parametrize("params", [
    {"start_date": "2020-10-05", "end_date": "2020-10-04"},
    {"start_date": "2020-02-30", "end_date": "2020-03-01"},
    {"start_date": "not-a-date", "end_date": "2020-03-01"},
    {"start_date": "2019-01-01", "end_date": "2020-10-04"},
])
def test_invalid_ranges_are_rejected_with_and_without_detail(client: TestClient, params: dict[str, str]) -> None:
    assert client.get("/api/analytics", params=params).status_code == 422
    assert client.get("/api/analytics", params={**params, "detail": "true"}).status_code == 422


def test_reporting_and_analysis_ranges_do_not_influence_each_other(client: TestClient) -> None:
    ids = seed(client)
    create_transaction(client, ids["bank"], ids["salary"], "100.00", "2020-10-02")
    create_transaction(client, ids["bank"], ids["food"], "40.00", "2020-10-20")
    reporting_before = analytics(client, "2020-05-01", "2020-10-31")["months"]
    analytics(client, "2020-10-18", "2020-10-22", detail="true")  # a narrow analysis range in between
    assert analytics(client, "2020-05-01", "2020-10-31")["months"] == reporting_before  # monthly figures are unaffected
    assert reporting_before[-1]["expenses"] == "40.00" and reporting_before[-1]["income"] == "100.00"
