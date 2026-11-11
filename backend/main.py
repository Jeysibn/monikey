"""MoniKey v1 REST API. Monetary totals are calculated with PostgreSQL NUMERIC."""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

import psycopg
from psycopg.types.json import Jsonb
from fastapi import FastAPI, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints
from starlette.exceptions import HTTPException as StarletteHTTPException

from database import DatabaseConfigurationError, open_connection

logger = logging.getLogger("monikey.api")

AccountType = Literal["cash", "bank", "ewallet", "credit_card"]
CategoryType = Literal["income", "expense"]
CategoryStatus = Literal["active", "archived", "all"]
KakeiboEnvelope = Literal["needs", "wants", "culture", "unexpected"]
CategoryIconKey = Literal[
    "shopping-basket", "utensils", "car-front", "house", "briefcase-business", "graduation-cap",
    "heart-pulse", "gamepad-2", "book-open", "shopping-bag", "gift", "piggy-bank",
    "coffee", "bus", "receipt", "smartphone", "plane", "wallet",
    "banknote", "dumbbell", "shirt", "paw-print", "music", "wrench",
]
# Curated keys, never raw CSS or hex: the frontend owns the contrast-checked colors (ADR-026).
CategoryColorKey = Literal["blue", "green", "teal", "amber", "orange", "red", "pink", "purple", "indigo", "slate"]
MoneyPattern = re.compile(r"^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$")
DatePattern = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
MonthPattern = re.compile(r"^[0-9]{4}-(?:0[1-9]|1[0-2])$")
CardProductPattern = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MAX_MONEY_CENTAVOS = 2**52 - 1
MAX_API_MONEY = Decimal(MAX_MONEY_CENTAVOS) / 100


def parse_money(value: object) -> Decimal:
    """Accept only decimal strings so JSON floats never enter financial calculations."""
    if not isinstance(value, str) or not MoneyPattern.fullmatch(value):
        raise ValueError("Enter a decimal amount with no more than two fractional digits.")
    return Decimal(value).quantize(Decimal("0.01"))


def parse_calendar_date(value: object) -> date:
    """Require a real YYYY-MM-DD calendar date, without timezone conversion."""
    if not isinstance(value, str) or not DatePattern.fullmatch(value):
        raise ValueError("Enter a date in YYYY-MM-DD format.")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise ValueError("Enter a valid calendar date.") from error


def normalize_note(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Note must be text.")
    note = value.strip()
    if len(note) > 120:
        raise ValueError("Note must be 120 characters or fewer.")
    return note or None


Money = Annotated[Decimal, BeforeValidator(parse_money), Field(max_digits=12, decimal_places=2)]


def parse_signed_money(value: object) -> Decimal:
    if isinstance(value, str) and value.startswith("-"):
        return -parse_money(value[1:])
    return parse_money(value)


SignedMoney = Annotated[Decimal, BeforeValidator(parse_signed_money), Field(max_digits=12, decimal_places=2)]
PositiveMoney = Annotated[Money, Field(gt=0)]
CalendarDate = Annotated[date, BeforeValidator(parse_calendar_date)]
AccountName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


def normalize_category_name(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Category name must be text.")
    name = " ".join(value.split())
    if not name:
        raise ValueError("Enter a category name.")
    if len(name) > 60:
        raise ValueError("Category name must be 60 characters or fewer.")
    return name


CategoryName = Annotated[
    str,
    BeforeValidator(normalize_category_name),
    StringConstraints(min_length=1, max_length=60),
]
Note = Annotated[str | None, BeforeValidator(normalize_note)]
NonnegativeMoney = Annotated[Money, Field(ge=0)]
MonthIntention = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=240)]
ReviewText = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=1000)]


def parse_card_product_id(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > 64 or not CardProductPattern.fullmatch(value):
        raise ValueError("Choose a card from the list.")
    return value


CardProductId = Annotated[str | None, BeforeValidator(parse_card_product_id)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AccountInput(InputModel):
    name: AccountName
    type: AccountType
    opening_balance: Money = Decimal("0.00")
    opening_debt: Money = Decimal("0.00")
    credit_limit: Money | None = None
    card_product_id: CardProductId = None


class TransactionInput(InputModel):
    account_id: Annotated[int, Field(gt=0)]
    category_id: Annotated[int, Field(gt=0)]
    amount: PositiveMoney
    transaction_date: CalendarDate
    note: Note = None
    kakeibo_envelope: KakeiboEnvelope | None = None


class AccountUpdateInput(InputModel):
    name: AccountName
    type: AccountType
    current_balance: SignedMoney
    current_debt: SignedMoney
    credit_limit: Money | None = None
    card_product_id: CardProductId = None


class PaymentInput(InputModel):
    source_account_id: Annotated[int, Field(gt=0)]
    card_account_id: Annotated[int, Field(gt=0)]
    amount: PositiveMoney
    payment_date: CalendarDate
    note: Note = None


class TransferInput(InputModel):
    source_account_id: Annotated[int, Field(gt=0)]
    destination_account_id: Annotated[int, Field(gt=0)]
    amount: PositiveMoney
    transfer_date: CalendarDate
    note: Note = None


class CategoryEnvelopeInput(InputModel):
    default_kakeibo_envelope: KakeiboEnvelope | None


class CategoryInput(InputModel):
    name: CategoryName
    type: CategoryType
    default_kakeibo_envelope: KakeiboEnvelope | None = None
    icon_key: CategoryIconKey | None = None
    color_key: CategoryColorKey | None = None


class CategoryUpdateInput(InputModel):
    name: CategoryName | None = None
    default_kakeibo_envelope: KakeiboEnvelope | None = None
    icon_key: CategoryIconKey | None = None
    color_key: CategoryColorKey | None = None


class CategoryArchiveInput(InputModel):
    is_archived: bool


class TransactionEnvelopeInput(InputModel):
    kakeibo_envelope: KakeiboEnvelope | None


class KakeiboMonthPlanInput(InputModel):
    planned_income: NonnegativeMoney
    allocated_starting_funds: NonnegativeMoney
    savings_target: NonnegativeMoney
    prior_period_debt_reserve: NonnegativeMoney
    needs_limit: NonnegativeMoney
    wants_limit: NonnegativeMoney
    culture_limit: NonnegativeMoney
    unexpected_limit: NonnegativeMoney
    monthly_intention: MonthIntention = None


class KakeiboMonthReviewInput(InputModel):
    actual_saved_declared: NonnegativeMoney | None = None
    review_available: ReviewText = None
    review_savings: ReviewText = None
    review_change: ReviewText = None
    review_appreciated: ReviewText = None
    review_surprise: ReviewText = None
    review_lesson: ReviewText = None


class KakeiboWeekReviewInput(InputModel):
    surprise_note: ReviewText = None
    worthwhile_note: ReviewText = None
    next_week_intention: ReviewText = None


class ApiProblem(Exception):
    def __init__(self, status: int, code: str, message: str, field: str | None = None):
        self.status = status
        self.code = code
        self.message = message
        self.field = field


app = FastAPI(title="MoniKey API", version="1.2.0")


@app.exception_handler(ApiProblem)
async def handle_api_problem(_request: Request, error: ApiProblem) -> JSONResponse:
    payload: dict[str, str] = {"code": error.code, "message": error.message}
    if error.field:
        payload["field"] = error.field
    return JSONResponse(status_code=error.status, content={"error": payload})


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    details = error.errors()
    location = details[0].get("loc", ()) if details else ()
    field = str(location[-1]) if location else None
    payload: dict[str, str] = {
        "code": "invalid_field",
        "message": "The request could not be validated.",
    }
    if field:
        payload["field"] = field
    if field == "card_product_id":
        payload["message"] = "Choose a card from the list."
    return JSONResponse(status_code=422, content={"error": payload})


@app.exception_handler(StarletteHTTPException)
async def handle_http_error(
    _request: Request,
    error: StarletteHTTPException,
) -> JSONResponse:
    if error.status_code == 404:
        code, message = "not_found", "Resource not found."
    elif error.status_code == 405:
        code, message = "method_not_allowed", "This request method is not supported for the resource."
    else:
        code, message = "request_error", "The server could not complete the request."
    return JSONResponse(status_code=error.status_code, content={"error": {"code": code, "message": message}})


@app.exception_handler(DatabaseConfigurationError)
async def handle_database_configuration_error(
    _request: Request,
    _error: DatabaseConfigurationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "database_unavailable", "message": "The database is unavailable."}},
    )


@app.exception_handler(psycopg.OperationalError)
async def handle_database_connection_error(
    _request: Request,
    _error: psycopg.OperationalError,
) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"error": {"code": "database_unavailable", "message": "The database is unavailable."}},
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(_request: Request, _error: Exception) -> JSONResponse:
    # Do not log SQL parameters or request bodies, which can contain personal notes.
    logger.error("Unexpected API error")
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "The server could not complete the request."}},
    )


def format_money(value: Decimal | int) -> str:
    amount = Decimal(value)
    if abs(amount) > MAX_API_MONEY:
        raise ApiProblem(500, "internal_error", "A calculated monetary value exceeds the supported range.")
    return f"{amount:.2f}"


def format_timestamp(value: object) -> str:
    timestamp = value
    if not hasattr(timestamp, "isoformat"):
        raise TypeError("Database timestamp was not a datetime")
    return timestamp.isoformat().replace("+00:00", "Z")


def month_bounds(month: str) -> tuple[date, date]:
    if not MonthPattern.fullmatch(month):
        raise ApiProblem(422, "invalid_field", "Month must use YYYY-MM format.", "month")
    year, month_number = (int(part) for part in month.split("-"))
    if year < 1 or (year == 9999 and month_number == 12):
        raise ApiProblem(422, "invalid_field", "Month is outside the supported date range.", "month")
    first_day = date(year, month_number, 1)
    if month_number == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month_number + 1, 1)
    return first_day, next_month


def week_bounds(week_start_value: str) -> tuple[date, date, date]:
    try:
        week_start = parse_calendar_date(week_start_value)
    except ValueError as error:
        raise ApiProblem(422, "invalid_field", str(error), "week_start") from None
    if week_start.weekday() != 0:
        raise ApiProblem(422, "invalid_field", "Week start must be a Monday.", "week_start")
    try:
        week_end = week_start + timedelta(days=6)
        end_exclusive = week_start + timedelta(days=7)
    except OverflowError:
        raise ApiProblem(422, "invalid_field", "Week is outside the supported date range.", "week_start") from None
    return week_start, week_end, end_exclusive


def get_kakeibo_plan(connection: psycopg.Connection, month_start: date) -> dict[str, object] | None:
    return connection.execute(
        "SELECT * FROM kakeibo_month_plans WHERE month = %s",
        (month_start,),
    ).fetchone()


def kakeibo_plan_response(row: dict[str, object] | None) -> dict[str, object] | None:
    if row is None:
        return None
    money_fields = (
        "planned_income",
        "allocated_starting_funds",
        "savings_target",
        "prior_period_debt_reserve",
        "needs_limit",
        "wants_limit",
        "culture_limit",
        "unexpected_limit",
    )
    response: dict[str, object] = {
        "month": row["month"].isoformat(),
        "monthly_intention": row["monthly_intention"],
        "actual_saved_declared": (
            None if row["actual_saved_declared"] is None else format_money(row["actual_saved_declared"])
        ),
        "review_available": row["review_available"],
        "review_savings": row["review_savings"],
        "review_change": row["review_change"],
        "review_appreciated": row["review_appreciated"],
        "review_surprise": row["review_surprise"],
        "review_lesson": row["review_lesson"],
        "reviewed_at": None if row["reviewed_at"] is None else format_timestamp(row["reviewed_at"]),
        "review_actuals_snapshot": row["review_actuals_snapshot"],
        "created_at": format_timestamp(row["created_at"]),
        "updated_at": format_timestamp(row["updated_at"]),
    }
    response.update({field: format_money(row[field]) for field in money_fields})
    return response


def kakeibo_review_response(row: dict[str, object] | None) -> dict[str, object] | None:
    if row is None or row["reviewed_at"] is None:
        return None
    return {
        "actual_saved_declared": (
            None if row["actual_saved_declared"] is None else format_money(row["actual_saved_declared"])
        ),
        "review_available": row["review_available"],
        "review_savings": row["review_savings"],
        "review_change": row["review_change"],
        "review_appreciated": row["review_appreciated"],
        "review_surprise": row["review_surprise"],
        "review_lesson": row["review_lesson"],
        "reviewed_at": format_timestamp(row["reviewed_at"]),
        "review_actuals_snapshot": row["review_actuals_snapshot"],
    }


def kakeibo_actuals(connection: psycopg.Connection, start_date: date, end_date: date) -> dict[str, Decimal]:
    row = connection.execute(
        """
        SELECT
          COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'income'), 0) AS actual_income,
          COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense'), 0) AS total_expenses,
          COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'needs'), 0) AS needs,
          COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'wants'), 0) AS wants,
          COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'culture'), 0) AS culture,
          COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'unexpected'), 0) AS unexpected,
          COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope IS NULL), 0) AS unclassified
        FROM transactions AS t
        JOIN categories AS c ON c.id = t.category_id
        WHERE t.transaction_date >= %s AND t.transaction_date < %s
        """,
        (start_date, end_date),
    ).fetchone()
    return {key: Decimal(value) for key, value in row.items()}


def kakeibo_month_response(
    connection: psycopg.Connection,
    month: str,
) -> dict[str, object]:
    start_date, end_date = month_bounds(month)
    plan = get_kakeibo_plan(connection, start_date)
    actuals = kakeibo_actuals(connection, start_date, end_date)
    plan_status = (
        "not_saved" if plan is None
        else "legacy_unknown" if plan["plan_presence"] is None
        else plan["plan_presence"]
    )
    has_plan = plan_status != "not_saved"
    plan_json = kakeibo_plan_response(plan if has_plan else None)

    envelope_report: dict[str, dict[str, str | None]] = {}
    available_to_allocate: Decimal | None = None
    unallocated: Decimal | None = None
    if has_plan and plan is not None:
        available_to_allocate = (
            Decimal(plan["planned_income"])
            + Decimal(plan["allocated_starting_funds"])
            - Decimal(plan["savings_target"])
            - Decimal(plan["prior_period_debt_reserve"])
        )
        total_limits = Decimal("0.00")
        for envelope in ("needs", "wants", "culture", "unexpected"):
            limit = Decimal(plan[f"{envelope}_limit"])
            total_limits += limit
            spent = actuals[envelope]
            envelope_report[envelope] = {
                "limit": format_money(limit),
                "actual_spent": format_money(spent),
                "remaining": format_money(limit - spent),
            }
        unallocated = available_to_allocate - total_limits
    else:
        for envelope in ("needs", "wants", "culture", "unexpected"):
            envelope_report[envelope] = {
                "limit": None,
                "actual_spent": format_money(actuals[envelope]),
                "remaining": None,
            }

    current_snapshot = {
        "actual_income": format_money(actuals["actual_income"]),
        "total_expenses": format_money(actuals["total_expenses"]),
        "unclassified": format_money(actuals["unclassified"]),
        "envelopes": {
            envelope: format_money(actuals[envelope])
            for envelope in ("needs", "wants", "culture", "unexpected")
        },
    }
    reviewed_at = None if plan is None else plan["reviewed_at"]
    saved_snapshot = None if plan is None else plan["review_actuals_snapshot"]
    actuals_changed = bool(reviewed_at and saved_snapshot != current_snapshot)

    return {
        "month": month,
        "plan_status": plan_status,
        "plan": plan_json,
        "planned_income": None if not has_plan or plan is None else format_money(plan["planned_income"]),
        "actual_income": format_money(actuals["actual_income"]),
        "available_to_allocate": None if available_to_allocate is None else format_money(available_to_allocate),
        "unallocated": None if unallocated is None else format_money(unallocated),
        "envelopes": envelope_report,
        "unclassified_expenses": format_money(actuals["unclassified"]),
        "total_expenses": format_money(actuals["total_expenses"]),
        "savings_target": None if not has_plan or plan is None else format_money(plan["savings_target"]),
        "actual_saved_declared": (
            None if plan is None or plan["actual_saved_declared"] is None
            else format_money(plan["actual_saved_declared"])
        ),
        "reviewed_at": None if reviewed_at is None else format_timestamp(reviewed_at),
        "actuals_changed_since_review": actuals_changed,
        "review": kakeibo_review_response(plan),
    }


def account_positions_sql() -> str:
    """Return each account's computed position without joining two one-to-many tables."""
    return """
        SELECT
          a.id,
          a.name,
          a.type,
          a.opening_balance,
          a.opening_debt,
          a.credit_limit,
          a.card_product_id,
          CASE
            WHEN a.type = 'credit_card' THEN
              a.opening_debt
                + COALESCE((
                  SELECT SUM(t.amount)
                  FROM transactions AS t
                  JOIN categories AS c ON c.id = t.category_id
                  WHERE t.account_id = a.id AND c.type = 'expense'
                ), 0)
                - COALESCE((
                  SELECT SUM(p.amount)
                  FROM credit_card_payments AS p
                  WHERE p.card_account_id = a.id
                ), 0)
            ELSE
              a.opening_balance
                + COALESCE((
                  SELECT SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE -t.amount END)
                  FROM transactions AS t
                  JOIN categories AS c ON c.id = t.category_id
                  WHERE t.account_id = a.id
                ), 0)
                - COALESCE((
                  SELECT SUM(p.amount)
                  FROM credit_card_payments AS p
                  WHERE p.source_account_id = a.id
                ), 0)
                - COALESCE((
                  SELECT SUM(x.amount)
                  FROM account_transfers AS x
                  WHERE x.source_account_id = a.id
                ), 0)
                + COALESCE((
                  SELECT SUM(x.amount)
                  FROM account_transfers AS x
                  WHERE x.destination_account_id = a.id
                ), 0)
          END AS position
        FROM accounts AS a
    """


def account_response(row: dict[str, object]) -> dict[str, object]:
    position = row["position"]
    if not isinstance(position, Decimal):
        position = Decimal(position)
    response: dict[str, object] = {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "card_product_id": row["card_product_id"],
    }
    if row["type"] == "credit_card":
        credit_limit = Decimal(row["credit_limit"])
        response.update(
            {
                "credit_limit": format_money(credit_limit),
                "outstanding_signed_debt": format_money(position),
                "available_credit": format_money(credit_limit - position),
                "owed": format_money(max(position, Decimal("0.00"))),
                "credit": format_money(max(-position, Decimal("0.00"))),
            }
        )
    else:
        response["balance"] = format_money(position)
    return response


def account_edit_response(row: dict[str, object]) -> dict[str, object]:
    """Return current amounts; signed debt below zero represents card credit."""
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "card_product_id": row["card_product_id"],
        "current_balance": format_money(row["position"] if row["type"] != "credit_card" else 0),
        "current_debt": format_money(row["position"] if row["type"] == "credit_card" else 0),
        "credit_limit": None if row["credit_limit"] is None else format_money(Decimal(row["credit_limit"])),
    }


def validate_account_input(values: AccountInput) -> None:
    if values.type == "cash" and values.card_product_id is not None:
        raise ApiProblem(422, "invalid_field", "Cash accounts don't have a card.", "card_product_id")
    if values.type == "credit_card":
        if values.opening_balance != 0:
            raise ApiProblem(400, "invalid_account_type_combination", "Credit cards cannot have an opening cash balance.", "opening_balance")
        if values.credit_limit is None or values.credit_limit <= 0:
            raise ApiProblem(400, "invalid_account_type_combination", "Credit cards need a positive credit limit.", "credit_limit")
    elif values.credit_limit is not None:
        raise ApiProblem(400, "invalid_account_type_combination", "Only credit cards can have a credit limit.", "credit_limit")
    elif values.opening_debt != 0:
        raise ApiProblem(400, "invalid_account_type_combination", "Only credit cards can have opening debt.", "opening_debt")


def validate_transaction_references(
    connection: psycopg.Connection,
    values: TransactionInput,
    expected_category_type: str | None = None,
    kakeibo_envelope: KakeiboEnvelope | None = None,
    allow_archived_category_id: int | None = None,
) -> None:
    category = connection.execute(
        "SELECT type, is_archived FROM categories WHERE id = %s FOR SHARE",
        (values.category_id,),
    ).fetchone()
    if category is None:
        raise ApiProblem(400, "invalid_field", "Choose an existing category.", "category_id")
    if category["is_archived"] and values.category_id != allow_archived_category_id:
        raise ApiProblem(
            409,
            "category_archived",
            "Restore this category before using it for a transaction.",
            "category_id",
        )

    account = connection.execute(
        "SELECT type FROM accounts WHERE id = %s",
        (values.account_id,),
    ).fetchone()
    if account is None:
        raise ApiProblem(400, "invalid_field", "Choose an existing account.", "account_id")
    if expected_category_type is not None and category["type"] != expected_category_type:
        raise ApiProblem(400, "invalid_account_type_combination", "Keep the transaction's income or expense category type when editing.", "category_id")
    if kakeibo_envelope is not None and category["type"] != "expense":
        raise ApiProblem(422, "invalid_field", "Income transactions cannot have a Kakeibo envelope.", "kakeibo_envelope")
    if account["type"] == "credit_card" and category["type"] != "expense":
        raise ApiProblem(400, "invalid_account_type_combination", "Credit-card accounts can only be used for expenses.", "category_id")


def validate_payment_references(connection: psycopg.Connection, values: PaymentInput) -> None:
    row = connection.execute(
        """
        SELECT source.type AS source_type, card.type AS card_type
        FROM accounts AS source
        LEFT JOIN accounts AS card ON card.id = %s
        WHERE source.id = %s
        """,
        (values.card_account_id, values.source_account_id),
    ).fetchone()
    if row is None:
        raise ApiProblem(400, "invalid_field", "Choose an existing paying account.", "source_account_id")
    if row["card_type"] is None:
        raise ApiProblem(400, "invalid_field", "Choose an existing credit card.", "card_account_id")
    if row["source_type"] == "credit_card":
        raise ApiProblem(400, "invalid_account_type_combination", "A card payment must come from a cash, bank, or e-wallet account.", "source_account_id")
    if row["card_type"] != "credit_card":
        raise ApiProblem(400, "invalid_account_type_combination", "A card payment must be sent to a credit-card account.", "card_account_id")


def validate_transfer_references(connection: psycopg.Connection, values: TransferInput) -> None:
    if values.source_account_id == values.destination_account_id:
        raise ApiProblem(400, "invalid_transfer_accounts", "Choose two different accounts.", "destination_account_id")
    rows = connection.execute(
        "SELECT id, type FROM accounts WHERE id = ANY(%s)",
        ([values.source_account_id, values.destination_account_id],),
    ).fetchall()
    by_id = {row["id"]: row["type"] for row in rows}
    if values.source_account_id not in by_id:
        raise ApiProblem(400, "invalid_field", "Choose an existing source account.", "source_account_id")
    if values.destination_account_id not in by_id:
        raise ApiProblem(400, "invalid_field", "Choose an existing destination account.", "destination_account_id")
    if by_id[values.source_account_id] == "credit_card":
        raise ApiProblem(400, "invalid_account_type_combination", "Transfers must come from a cash, bank, or e-wallet account.", "source_account_id")
    if by_id[values.destination_account_id] == "credit_card":
        raise ApiProblem(400, "invalid_account_type_combination", "Transfers must go to a cash, bank, or e-wallet account.", "destination_account_id")


def transaction_response(row: dict[str, object]) -> dict[str, object]:
    return {
        "id": row["id"],
        "account_id": row["account_id"],
        "category_id": row["category_id"],
        "amount": format_money(row["amount"]),
        "transaction_date": row["transaction_date"].isoformat(),
        "note": row["note"],
        "kakeibo_envelope": row["kakeibo_envelope"],
        "created_at": format_timestamp(row["created_at"]),
    }


def payment_response(row: dict[str, object]) -> dict[str, object]:
    return {
        "id": row["id"],
        "source_account_id": row["source_account_id"],
        "card_account_id": row["card_account_id"],
        "amount": format_money(row["amount"]),
        "payment_date": row["payment_date"].isoformat(),
        "note": row["note"],
        "created_at": format_timestamp(row["created_at"]),
    }


def transfer_response(row: dict[str, object]) -> dict[str, object]:
    return {
        "id": row["id"],
        "source_account_id": row["source_account_id"],
        "destination_account_id": row["destination_account_id"],
        "amount": format_money(row["amount"]),
        "transfer_date": row["transfer_date"].isoformat(),
        "note": row["note"],
        "created_at": format_timestamp(row["created_at"]),
    }


def get_transaction(connection: psycopg.Connection, record_id: int) -> dict[str, object]:
    row = connection.execute(
        """
        SELECT id, account_id, category_id, amount, transaction_date, note, kakeibo_envelope, created_at
        FROM transactions
        WHERE id = %s
        """,
        (record_id,),
    ).fetchone()
    if row is None:
        raise ApiProblem(404, "not_found", "Transaction not found.")
    return transaction_response(row)


def get_payment(connection: psycopg.Connection, record_id: int) -> dict[str, object]:
    row = connection.execute(
        """
        SELECT id, source_account_id, card_account_id, amount, payment_date, note, created_at
        FROM credit_card_payments
        WHERE id = %s
        """,
        (record_id,),
    ).fetchone()
    if row is None:
        raise ApiProblem(404, "not_found", "Card payment not found.")
    return payment_response(row)


@app.get("/api/health/live")
def health_live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health/ready")
def health_ready() -> dict[str, str]:
    try:
        with open_connection() as connection:
            connection.execute("SELECT 1").fetchone()
    except (DatabaseConfigurationError, psycopg.OperationalError):
        raise ApiProblem(503, "database_unavailable", "The database is unavailable.") from None
    return {"status": "ok"}


@app.get("/api/accounts")
def list_accounts() -> list[dict[str, object]]:
    with open_connection() as connection:
        rows = connection.execute(
            f"{account_positions_sql()} ORDER BY a.id"
        ).fetchall()
    return [account_response(row) for row in rows]


@app.post("/api/accounts", status_code=201)
def create_account(values: AccountInput) -> dict[str, object]:
    validate_account_input(values)
    try:
        with open_connection() as connection:
            row = connection.execute(
                """
                INSERT INTO accounts (name, type, opening_balance, opening_debt, credit_limit, card_product_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (values.name, values.type, values.opening_balance, values.opening_debt, values.credit_limit, values.card_product_id),
            ).fetchone()
            account = connection.execute(
                f"{account_positions_sql()} WHERE a.id = %s",
                (row["id"],),
            ).fetchone()
        return account_response(account)
    except psycopg.errors.UniqueViolation:
        raise ApiProblem(409, "duplicate_account_name", "An account with this name already exists.", "name") from None


@app.get("/api/accounts/{account_id}")
def get_account_for_edit(account_id: Annotated[int, Path(gt=0)]) -> dict[str, object]:
    with open_connection() as connection:
        row = connection.execute(
            f"{account_positions_sql()} WHERE a.id = %s",
            (account_id,),
        ).fetchone()
    if row is None:
        raise ApiProblem(404, "not_found", "Account not found.")
    return account_edit_response(row)


@app.put("/api/accounts/{account_id}")
def update_account(account_id: Annotated[int, Path(gt=0)], values: AccountUpdateInput) -> dict[str, object]:
    if values.type == "credit_card":
        if values.current_balance != 0:
            raise ApiProblem(400, "invalid_account_type_combination", "Cards cannot have a cash balance.", "current_balance")
        if values.credit_limit is None or values.credit_limit <= 0:
            raise ApiProblem(400, "invalid_account_type_combination", "Cards need a positive credit limit.", "credit_limit")
    elif values.credit_limit is not None:
        raise ApiProblem(400, "invalid_account_type_combination", "Only cards can have a credit limit.", "credit_limit")
    elif values.current_debt != 0:
        raise ApiProblem(400, "invalid_account_type_combination", "Only cards can have debt.", "current_debt")
    try:
        with open_connection() as connection:
            existing = connection.execute(
                "SELECT type, card_product_id FROM accounts WHERE id = %s FOR UPDATE",
                (account_id,),
            ).fetchone()
            if existing is None:
                raise ApiProblem(404, "not_found", "Account not found.")
            if existing["type"] != values.type:
                raise ApiProblem(
                    400,
                    "invalid_account_type_combination",
                    "Account type cannot be changed after creation.",
                    "type",
                )
            card_product_id = (
                values.card_product_id
                if "card_product_id" in values.model_fields_set
                else existing["card_product_id"]
            )
            if values.type == "cash" and card_product_id is not None:
                raise ApiProblem(422, "invalid_field", "Cash accounts don't have a card.", "card_product_id")
            current = connection.execute(
                f"{account_positions_sql()} WHERE a.id = %s", (account_id,),
            ).fetchone()
            # Correct the baseline by the difference, preserving every ledger row.
            opening_balance = Decimal("0.00")
            opening_debt = Decimal("0.00")
            field = "current_debt" if values.type == "credit_card" else "current_balance"
            if values.type == "credit_card":
                opening_debt = current["opening_debt"] + values.current_debt - current["position"]
            else:
                opening_balance = current["opening_balance"] + values.current_balance - current["position"]
            if max(abs(opening_balance), abs(opening_debt)) > Decimal("9999999999.99"):
                raise ApiProblem(422, "invalid_field", "This correction exceeds the supported account range.", field)
            connection.execute(
                """
                UPDATE accounts
                SET name = %s, opening_balance = %s, opening_debt = %s, credit_limit = %s, card_product_id = %s
                WHERE id = %s
                """,
                (values.name, opening_balance, opening_debt, values.credit_limit, card_product_id, account_id),
            )
            row = connection.execute(
                f"{account_positions_sql()} WHERE a.id = %s",
                (account_id,),
            ).fetchone()
        return account_response(row)
    except psycopg.errors.UniqueViolation:
        raise ApiProblem(409, "duplicate_account_name", "An account with this name already exists.", "name") from None


CATEGORY_COLUMNS = "c.id, c.name, c.type, c.default_kakeibo_envelope, c.is_archived, c.icon_key, c.color_key"


def fetch_category(connection: psycopg.Connection, category_id: int) -> dict[str, object] | None:
    """One category with its all-time usage count (transactions referencing it; archived rows included)."""
    return connection.execute(
        f"""SELECT {CATEGORY_COLUMNS},
                   (SELECT COUNT(*) FROM transactions AS t WHERE t.category_id = c.id)::int AS usage_count
              FROM categories AS c WHERE c.id = %s""",
        (category_id,),
    ).fetchone()


@app.get("/api/categories")
def list_categories(
    category_type: CategoryType | None = Query(default=None, alias="type"),
    status: CategoryStatus = Query(default="all"),
) -> list[dict[str, object]]:
    # Usage counts come from ONE grouped aggregate joined once (never a query per category).
    query = f"""SELECT {CATEGORY_COLUMNS}, COALESCE(u.usage_count, 0)::int AS usage_count
                  FROM categories AS c
                  LEFT JOIN (SELECT category_id, COUNT(*) AS usage_count
                               FROM transactions GROUP BY category_id) AS u ON u.category_id = c.id"""
    clauses: list[str] = []
    parameters: list[object] = []
    if category_type is not None:
        clauses.append("c.type = %s")
        parameters.append(category_type)
    if status == "active":
        clauses.append("c.is_archived = FALSE")
    elif status == "archived":
        clauses.append("c.is_archived = TRUE")
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY c.type, lower(c.name), c.id"
    with open_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return rows


@app.get("/api/categories/{category_id}")
def get_category(category_id: Annotated[int, Path(gt=0)]) -> dict[str, object]:
    with open_connection() as connection:
        row = fetch_category(connection, category_id)
    if row is None:
        raise ApiProblem(404, "not_found", "Category not found.")
    return row


@app.post("/api/categories", status_code=201)
def create_category(values: CategoryInput) -> dict[str, object]:
    if values.type == "income" and values.default_kakeibo_envelope is not None:
        raise ApiProblem(
            422,
            "invalid_field",
            "Only expense categories can have a Kakeibo default.",
            "default_kakeibo_envelope",
        )
    try:
        with open_connection() as connection:
            created = connection.execute(
                """INSERT INTO categories (name, type, default_kakeibo_envelope, icon_key, color_key)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING id""",
                (values.name, values.type, values.default_kakeibo_envelope, values.icon_key, values.color_key),
            ).fetchone()
            row = fetch_category(connection, created["id"])
    except psycopg.errors.UniqueViolation:
        raise ApiProblem(
            409,
            "duplicate_category_name",
            "A category with this name and type already exists.",
            "name",
        ) from None
    return row


@app.patch("/api/categories/{category_id}")
def update_category(
    values: CategoryUpdateInput,
    category_id: Annotated[int, Path(gt=0)],
) -> dict[str, object]:
    supplied = values.model_fields_set
    if not supplied:
        raise ApiProblem(422, "invalid_field", "Provide a category name, default envelope, icon, or color to update.")
    if "name" in supplied and values.name is None:
        raise ApiProblem(422, "invalid_field", "Category name cannot be empty.", "name")

    try:
        with open_connection() as connection:
            category = connection.execute(
                """SELECT id, name, type, default_kakeibo_envelope, is_archived, icon_key, color_key
                     FROM categories WHERE id = %s FOR UPDATE""",
                (category_id,),
            ).fetchone()
            if category is None:
                raise ApiProblem(404, "not_found", "Category not found.")
            if (
                "default_kakeibo_envelope" in supplied
                and category["type"] != "expense"
                and values.default_kakeibo_envelope is not None
            ):
                raise ApiProblem(
                    422,
                    "invalid_field",
                    "Only expense categories can have a Kakeibo default.",
                    "default_kakeibo_envelope",
                )
            connection.execute(
                """UPDATE categories
                      SET name = %s, default_kakeibo_envelope = %s, icon_key = %s, color_key = %s
                    WHERE id = %s""",
                (
                    values.name if "name" in supplied else category["name"],
                    values.default_kakeibo_envelope
                    if "default_kakeibo_envelope" in supplied
                    else category["default_kakeibo_envelope"],
                    values.icon_key if "icon_key" in supplied else category["icon_key"],
                    values.color_key if "color_key" in supplied else category["color_key"],
                    category_id,
                ),
            )
            row = fetch_category(connection, category_id)
    except psycopg.errors.UniqueViolation:
        raise ApiProblem(
            409,
            "duplicate_category_name",
            "A category with this name and type already exists.",
            "name",
        ) from None
    return row


@app.patch("/api/categories/{category_id}/archive")
def set_category_archived(
    values: CategoryArchiveInput,
    category_id: Annotated[int, Path(gt=0)],
) -> dict[str, object]:
    with open_connection() as connection:
        updated = connection.execute(
            "UPDATE categories SET is_archived = %s WHERE id = %s RETURNING id",
            (values.is_archived, category_id),
        ).fetchone()
        row = fetch_category(connection, category_id) if updated else None
    if row is None:
        raise ApiProblem(404, "not_found", "Category not found.")
    return row


@app.delete("/api/categories/{category_id}", status_code=204)
def delete_category(category_id: Annotated[int, Path(gt=0)]) -> Response:
    with open_connection() as connection:
        category = connection.execute(
            "SELECT id FROM categories WHERE id = %s FOR UPDATE",
            (category_id,),
        ).fetchone()
        if category is None:
            raise ApiProblem(404, "not_found", "Category not found.")
        referenced = connection.execute(
            "SELECT EXISTS (SELECT 1 FROM transactions WHERE category_id = %s) AS referenced",
            (category_id,),
        ).fetchone()["referenced"]
        if referenced:
            raise ApiProblem(409, "category_in_use", "This category has transactions. Archive it instead.")
        connection.execute("DELETE FROM categories WHERE id = %s", (category_id,))
    return Response(status_code=204)


@app.patch("/api/categories/{category_id}/default-kakeibo-envelope")
def update_category_envelope_default(
    values: CategoryEnvelopeInput,
    category_id: Annotated[int, Path(gt=0)],
) -> dict[str, object]:
    with open_connection() as connection:
        category = connection.execute(
            "SELECT id, name, type, icon_key, is_archived FROM categories WHERE id = %s",
            (category_id,),
        ).fetchone()
        if category is None:
            raise ApiProblem(404, "not_found", "Category not found.")
        if category["type"] != "expense" and values.default_kakeibo_envelope is not None:
            raise ApiProblem(422, "invalid_field", "Only expense categories can have a Kakeibo default.", "default_kakeibo_envelope")
        connection.execute(
            "UPDATE categories SET default_kakeibo_envelope = %s WHERE id = %s",
            (values.default_kakeibo_envelope, category_id),
        )
        row = fetch_category(connection, category_id)
    return row


# Activity search and filters (additive, optional query parameters on the three Activity reads). They are applied
# in SQL, before ORDER BY and LIMIT, so a filtered page is the newest matching rows of the whole month and never
# a filter over rows that happened to be loaded.
ActivitySearch = Annotated[str | None, Query(max_length=80, description="Case-insensitive text to find")]


def like_pattern(value: str | None) -> str | None:
    """'%text%' for ILIKE ... ESCAPE '\\' with the person's own % and _ and \\ matched literally; None for a blank search."""
    text = " ".join((value or "").split())
    if not text:
        return None
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


@app.get("/api/transactions")
def list_transactions(
    month: str,
    account_id: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=1001)] = 50,
    category_id: Annotated[int | None, Query(ge=1)] = None,
    kind: Literal["income", "expense"] | None = None,
    q: ActivitySearch = None,
) -> list[dict[str, object]]:
    start_date, end_date = month_bounds(month)
    query = """
        SELECT t.id, t.account_id, t.category_id, t.amount, t.transaction_date, t.note, t.kakeibo_envelope, t.created_at
        FROM transactions AS t
        JOIN categories AS c ON c.id = t.category_id
        JOIN accounts AS a ON a.id = t.account_id
        WHERE t.transaction_date >= %s AND t.transaction_date < %s
    """
    parameters: list[object] = [start_date, end_date]
    if account_id is not None:
        query += " AND t.account_id = %s"
        parameters.append(account_id)
    if category_id is not None:
        query += " AND t.category_id = %s"
        parameters.append(category_id)
    if kind is not None:
        query += " AND c.type = %s"
        parameters.append(kind)
    pattern = like_pattern(q)
    if pattern is not None:  # what a row shows: its note, its category and its account
        query += " AND (t.note ILIKE %s ESCAPE '\\' OR c.name ILIKE %s ESCAPE '\\' OR a.name ILIKE %s ESCAPE '\\')"
        parameters.extend((pattern, pattern, pattern))
    query += " ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC LIMIT %s"
    parameters.append(limit)
    with open_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [transaction_response(row) for row in rows]


@app.post("/api/transactions", status_code=201)
def create_transaction(values: TransactionInput) -> dict[str, object]:
    with open_connection() as connection:
        validate_transaction_references(connection, values, kakeibo_envelope=values.kakeibo_envelope)
        row = connection.execute(
            """
            INSERT INTO transactions (account_id, category_id, amount, transaction_date, note, kakeibo_envelope)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, account_id, category_id, amount, transaction_date, note, kakeibo_envelope, created_at
            """,
            (values.account_id, values.category_id, values.amount, values.transaction_date, values.note, values.kakeibo_envelope),
        ).fetchone()
    return transaction_response(row)


@app.put("/api/transactions/{record_id}")
def replace_transaction(
    values: TransactionInput,
    record_id: Annotated[int, Path(gt=0)],
) -> dict[str, object]:
    with open_connection() as connection:
        existing = connection.execute(
            """
            SELECT c.type AS category_type, t.category_id, t.kakeibo_envelope
            FROM transactions AS t
            JOIN categories AS c ON c.id = t.category_id
            WHERE t.id = %s
            """,
            (record_id,),
        ).fetchone()
        if existing is None:
            raise ApiProblem(404, "not_found", "Transaction not found.")
        envelope = (
            values.kakeibo_envelope
            if "kakeibo_envelope" in values.model_fields_set
            else existing["kakeibo_envelope"]
        )
        validate_transaction_references(
            connection,
            values,
            expected_category_type=existing["category_type"],
            kakeibo_envelope=envelope,
            allow_archived_category_id=existing["category_id"],
        )
        row = connection.execute(
            """
            UPDATE transactions
            SET account_id = %s, category_id = %s, amount = %s, transaction_date = %s, note = %s,
                kakeibo_envelope = %s
            WHERE id = %s
            RETURNING id, account_id, category_id, amount, transaction_date, note, kakeibo_envelope, created_at
            """,
            (values.account_id, values.category_id, values.amount, values.transaction_date, values.note, envelope, record_id),
        ).fetchone()
        if row is None:
            raise ApiProblem(404, "not_found", "Transaction not found.")
    return transaction_response(row)


@app.patch("/api/transactions/{record_id}/kakeibo-envelope")
def patch_transaction_envelope(
    values: TransactionEnvelopeInput,
    record_id: Annotated[int, Path(gt=0)],
) -> dict[str, object]:
    with open_connection() as connection:
        existing = connection.execute(
            """
            SELECT c.type AS category_type
            FROM transactions AS t
            JOIN categories AS c ON c.id = t.category_id
            WHERE t.id = %s
            FOR UPDATE OF t
            """,
            (record_id,),
        ).fetchone()
        if existing is None:
            raise ApiProblem(404, "not_found", "Transaction not found.")
        if existing["category_type"] != "expense":
            raise ApiProblem(422, "invalid_field", "Only expense transactions can use this endpoint.", "kakeibo_envelope")
        row = connection.execute(
            """
            UPDATE transactions
            SET kakeibo_envelope = %s
            WHERE id = %s
            RETURNING id, account_id, category_id, amount, transaction_date, note, kakeibo_envelope, created_at
            """,
            (values.kakeibo_envelope, record_id),
        ).fetchone()
        if row is None:
            raise ApiProblem(404, "not_found", "Transaction not found.")
    return transaction_response(row)


@app.delete("/api/transactions/{record_id}", status_code=204)
def delete_transaction(record_id: Annotated[int, Path(gt=0)]) -> Response:
    with open_connection() as connection:
        result = connection.execute("DELETE FROM transactions WHERE id = %s", (record_id,))
        if result.rowcount == 0:
            raise ApiProblem(404, "not_found", "Transaction not found.")
    return Response(status_code=204)


@app.get("/api/credit-card-payments")
def list_payments(
    month: str,
    account_id: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=1001)] = 50,
    q: ActivitySearch = None,
) -> list[dict[str, object]]:
    start_date, end_date = month_bounds(month)
    query = """
        SELECT p.id, p.source_account_id, p.card_account_id, p.amount, p.payment_date, p.note, p.created_at
        FROM credit_card_payments AS p
        JOIN accounts AS source ON source.id = p.source_account_id
        JOIN accounts AS card ON card.id = p.card_account_id
        WHERE p.payment_date >= %s AND p.payment_date < %s
    """
    parameters: list[object] = [start_date, end_date]
    if account_id is not None:
        query += " AND (p.source_account_id = %s OR p.card_account_id = %s)"
        parameters.extend((account_id, account_id))
    pattern = like_pattern(q)
    if pattern is not None:  # its note and both accounts it shows
        query += " AND (p.note ILIKE %s ESCAPE '\\' OR source.name ILIKE %s ESCAPE '\\' OR card.name ILIKE %s ESCAPE '\\')"
        parameters.extend((pattern, pattern, pattern))
    query += " ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC LIMIT %s"
    parameters.append(limit)
    with open_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [payment_response(row) for row in rows]


@app.post("/api/credit-card-payments", status_code=201)
def create_payment(values: PaymentInput) -> dict[str, object]:
    with open_connection() as connection:
        validate_payment_references(connection, values)
        row = connection.execute(
            """
            INSERT INTO credit_card_payments
              (source_account_id, card_account_id, amount, payment_date, note)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, source_account_id, card_account_id, amount, payment_date, note, created_at
            """,
            (values.source_account_id, values.card_account_id, values.amount, values.payment_date, values.note),
        ).fetchone()
    return payment_response(row)


@app.put("/api/credit-card-payments/{record_id}")
def replace_payment(
    values: PaymentInput,
    record_id: Annotated[int, Path(gt=0)],
) -> dict[str, object]:
    with open_connection() as connection:
        validate_payment_references(connection, values)
        row = connection.execute(
            """
            UPDATE credit_card_payments
            SET source_account_id = %s, card_account_id = %s, amount = %s, payment_date = %s, note = %s
            WHERE id = %s
            RETURNING id, source_account_id, card_account_id, amount, payment_date, note, created_at
            """,
            (values.source_account_id, values.card_account_id, values.amount, values.payment_date, values.note, record_id),
        ).fetchone()
        if row is None:
            raise ApiProblem(404, "not_found", "Card payment not found.")
    return payment_response(row)


@app.delete("/api/credit-card-payments/{record_id}", status_code=204)
def delete_payment(record_id: Annotated[int, Path(gt=0)]) -> Response:
    with open_connection() as connection:
        result = connection.execute("DELETE FROM credit_card_payments WHERE id = %s", (record_id,))
        if result.rowcount == 0:
            raise ApiProblem(404, "not_found", "Card payment not found.")
    return Response(status_code=204)


@app.get("/api/account-transfers")
def list_transfers(
    month: str,
    account_id: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=1001)] = 50,
    q: ActivitySearch = None,
) -> list[dict[str, object]]:
    start_date, end_date = month_bounds(month)
    query = """
        SELECT x.id, x.source_account_id, x.destination_account_id, x.amount, x.transfer_date, x.note, x.created_at
        FROM account_transfers AS x
        JOIN accounts AS source ON source.id = x.source_account_id
        JOIN accounts AS destination ON destination.id = x.destination_account_id
        WHERE x.transfer_date >= %s AND x.transfer_date < %s
    """
    parameters: list[object] = [start_date, end_date]
    if account_id is not None:
        query += " AND (x.source_account_id = %s OR x.destination_account_id = %s)"
        parameters.extend((account_id, account_id))
    pattern = like_pattern(q)
    if pattern is not None:  # its note and both accounts it shows
        query += " AND (x.note ILIKE %s ESCAPE '\\' OR source.name ILIKE %s ESCAPE '\\' OR destination.name ILIKE %s ESCAPE '\\')"
        parameters.extend((pattern, pattern, pattern))
    query += " ORDER BY x.transfer_date DESC, x.created_at DESC, x.id DESC LIMIT %s"
    parameters.append(limit)
    with open_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [transfer_response(row) for row in rows]


@app.post("/api/account-transfers", status_code=201)
def create_transfer(values: TransferInput) -> dict[str, object]:
    with open_connection() as connection:
        validate_transfer_references(connection, values)
        row = connection.execute(
            """
            INSERT INTO account_transfers
              (source_account_id, destination_account_id, amount, transfer_date, note)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, source_account_id, destination_account_id, amount, transfer_date, note, created_at
            """,
            (values.source_account_id, values.destination_account_id, values.amount, values.transfer_date, values.note),
        ).fetchone()
    return transfer_response(row)


@app.put("/api/account-transfers/{record_id}")
def replace_transfer(
    values: TransferInput,
    record_id: Annotated[int, Path(gt=0)],
) -> dict[str, object]:
    with open_connection() as connection:
        validate_transfer_references(connection, values)
        row = connection.execute(
            """
            UPDATE account_transfers
            SET source_account_id = %s, destination_account_id = %s, amount = %s, transfer_date = %s, note = %s
            WHERE id = %s
            RETURNING id, source_account_id, destination_account_id, amount, transfer_date, note, created_at
            """,
            (values.source_account_id, values.destination_account_id, values.amount, values.transfer_date, values.note, record_id),
        ).fetchone()
        if row is None:
            raise ApiProblem(404, "not_found", "Transfer not found.")
    return transfer_response(row)


@app.delete("/api/account-transfers/{record_id}", status_code=204)
def delete_transfer(record_id: Annotated[int, Path(gt=0)]) -> Response:
    with open_connection() as connection:
        result = connection.execute("DELETE FROM account_transfers WHERE id = %s", (record_id,))
        if result.rowcount == 0:
            raise ApiProblem(404, "not_found", "Transfer not found.")
    return Response(status_code=204)


@app.get("/api/summary")
def get_summary(month: str) -> dict[str, str]:
    start_date, end_date = month_bounds(month)
    with open_connection() as connection:
        totals = connection.execute(
            f"""
            WITH account_positions AS ({account_positions_sql()})
            SELECT
              COALESCE(SUM(position) FILTER (WHERE type <> 'credit_card'), 0) AS liquid_balance,
              COALESCE(SUM(GREATEST(position, 0)) FILTER (WHERE type = 'credit_card'), 0) AS outstanding_debt,
              COALESCE(SUM(GREATEST(-position, 0)) FILTER (WHERE type = 'credit_card'), 0) AS card_credit,
              COALESCE(SUM(position) FILTER (WHERE type = 'credit_card'), 0) AS signed_card_debt,
              COALESCE((
                SELECT SUM(t.amount)
                FROM transactions AS t
                JOIN categories AS c ON c.id = t.category_id
                WHERE c.type = 'income'
                  AND t.transaction_date >= %s AND t.transaction_date < %s
              ), 0) AS month_income,
              COALESCE((
                SELECT SUM(t.amount)
                FROM transactions AS t
                JOIN categories AS c ON c.id = t.category_id
                WHERE c.type = 'expense'
                  AND t.transaction_date >= %s AND t.transaction_date < %s
              ), 0) AS month_expenses
            FROM account_positions
            """,
            (start_date, end_date, start_date, end_date),
        ).fetchone()
    return {
        "month": month,
        "liquid_balance": format_money(totals["liquid_balance"]),
        "outstanding_debt": format_money(totals["outstanding_debt"]),
        "card_credit": format_money(totals["card_credit"]),
        "net_position": format_money(totals["liquid_balance"] - totals["signed_card_debt"]),
        "month_income": format_money(totals["month_income"]),
        "month_expenses": format_money(totals["month_expenses"]),
    }


@app.get("/api/analytics")
def get_analytics(
    start_date: CalendarDate,
    end_date: CalendarDate,
    account_id: Annotated[int | None, Query(ge=1)] = None,
    detail: bool = False,
) -> dict[str, object]:
    """Bounded server-side analytics. Date values are Manila calendar dates, end_date is inclusive.

    The base response (totals, monthly series, categories, Kakeibo) is what the monthly reporting view reads.
    `detail=true` adds the day-level sections for the analysis view: `daily`, `weekdays` and `insights`.
    A range may not end in the future, so every day in it has already happened: zero-spend days, daily
    averages and weekday occurrence counts are then well defined.
    """
    if end_date < start_date:
        raise ApiProblem(422, "invalid_field", "End date must be on or after start date.", "end_date")
    manila_today = datetime.now(ZoneInfo("Asia/Manila")).date()
    if end_date > manila_today:
        raise ApiProblem(422, "invalid_field", "End date cannot be in the future.", "end_date")
    days = (end_date - start_date).days + 1
    if days > 366:
        raise ApiProblem(422, "invalid_field", "Choose a date range of 366 days or fewer.", "end_date")
    try:
        end_exclusive = end_date + timedelta(days=1)
    except OverflowError:
        raise ApiProblem(422, "invalid_field", "End date is outside the supported range.", "end_date") from None
    parameters: tuple[object, ...]
    account_clause = "" if account_id is None else " AND t.account_id = %s"
    account_parameter: tuple[object, ...] = () if account_id is None else (account_id,)
    with open_connection() as connection:
        if account_id is not None and not connection.execute(
            "SELECT EXISTS (SELECT 1 FROM accounts WHERE id = %s)", (account_id,),
        ).fetchone()["exists"]:
            raise ApiProblem(400, "invalid_field", "Choose an existing account.", "account_id")

        def totals_between(start: date, end: date) -> dict[str, str]:
            row = connection.execute(
                f"""SELECT
                      COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'income'), 0) AS income,
                      COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense'), 0) AS expenses
                    FROM transactions AS t JOIN categories AS c ON c.id = t.category_id
                    WHERE t.transaction_date >= %s AND t.transaction_date < %s{account_clause}""",
                (start, end, *account_parameter),
            ).fetchone()
            income = Decimal(row["income"])
            expenses = Decimal(row["expenses"])
            return {"income": format_money(income), "expenses": format_money(expenses), "net_cash_flow": format_money(income - expenses)}

        totals = totals_between(start_date, end_exclusive)
        comparison = None
        if end_date < manila_today:
            try:
                previous_start = start_date - timedelta(days=days)
            except OverflowError:
                previous_start = None
            if previous_start is not None:
                comparison = totals_between(previous_start, start_date)

        parameters = (start_date, end_exclusive, *account_parameter)
        monthly_rows = connection.execute(
            f"""WITH months AS (
                  SELECT generate_series(date_trunc('month', %s::date), date_trunc('month', %s::date), interval '1 month')::date AS month
                ), actuals AS (
                  SELECT date_trunc('month', t.transaction_date)::date AS month,
                    COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'income'), 0) AS income,
                    COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense'), 0) AS expenses
                  FROM transactions AS t JOIN categories AS c ON c.id = t.category_id
                  WHERE t.transaction_date >= %s AND t.transaction_date < %s{account_clause}
                  GROUP BY 1
                )
                SELECT months.month, COALESCE(actuals.income, 0) AS income, COALESCE(actuals.expenses, 0) AS expenses
                FROM months LEFT JOIN actuals ON actuals.month = months.month ORDER BY months.month""",
            (start_date, end_date, *parameters),
        ).fetchall()
        category_rows = connection.execute(
            f"""SELECT c.id, c.name, c.icon_key, c.color_key, c.is_archived, SUM(t.amount) AS expenses
                FROM transactions AS t JOIN categories AS c ON c.id = t.category_id
                WHERE c.type = 'expense' AND t.transaction_date >= %s AND t.transaction_date < %s{account_clause}
                GROUP BY c.id, c.name, c.icon_key, c.color_key, c.is_archived ORDER BY SUM(t.amount) DESC, c.name""",
            parameters,
        ).fetchall()
        envelope_rows = connection.execute(
            f"""WITH months AS (
                  SELECT generate_series(date_trunc('month', %s::date), date_trunc('month', %s::date), interval '1 month')::date AS month
                ), actuals AS (
                  SELECT date_trunc('month', t.transaction_date)::date AS month,
                    COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'needs'), 0) AS needs,
                    COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'wants'), 0) AS wants,
                    COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'culture'), 0) AS culture,
                    COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'unexpected'), 0) AS unexpected,
                    COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope IS NULL), 0) AS unclassified
                  FROM transactions AS t JOIN categories AS c ON c.id = t.category_id
                  WHERE t.transaction_date >= %s AND t.transaction_date < %s{account_clause}
                  GROUP BY 1
                )
                SELECT months.month, (p.month IS NOT NULL) AS has_plan, p.plan_presence,
                  p.needs_limit, p.wants_limit, p.culture_limit, p.unexpected_limit,
                  COALESCE(actuals.needs, 0) AS needs, COALESCE(actuals.wants, 0) AS wants,
                  COALESCE(actuals.culture, 0) AS culture, COALESCE(actuals.unexpected, 0) AS unexpected,
                  COALESCE(actuals.unclassified, 0) AS unclassified
                FROM months LEFT JOIN kakeibo_month_plans AS p ON p.month = months.month
                LEFT JOIN actuals ON actuals.month = months.month ORDER BY months.month""",
            (start_date, end_date, start_date, end_exclusive, *account_parameter),
        ).fetchall()
        envelope_totals = connection.execute(
            f"""SELECT
                COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'needs'), 0) AS needs,
                COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'wants'), 0) AS wants,
                COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'culture'), 0) AS culture,
                COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope = 'unexpected'), 0) AS unexpected,
                COALESCE(SUM(t.amount) FILTER (WHERE c.type = 'expense' AND t.kakeibo_envelope IS NULL), 0) AS unclassified
              FROM transactions AS t JOIN categories AS c ON c.id = t.category_id
              WHERE t.transaction_date >= %s AND t.transaction_date < %s{account_clause}""",
            parameters,
        ).fetchone()

        daily_rows: list[dict[str, object]] = []
        expense_transactions = 0
        if detail:
            # One row per calendar date, including dates with no spending (generate_series + LEFT JOIN).
            daily_rows = connection.execute(
                f"""WITH days AS (
                      SELECT generate_series(%s::date, %s::date, interval '1 day')::date AS day
                    ), actuals AS (
                      SELECT t.transaction_date AS day,
                        COALESCE(SUM(t.amount), 0) AS expenses,
                        COALESCE(SUM(t.amount) FILTER (WHERE t.kakeibo_envelope = 'needs'), 0) AS needs,
                        COALESCE(SUM(t.amount) FILTER (WHERE t.kakeibo_envelope = 'wants'), 0) AS wants,
                        COALESCE(SUM(t.amount) FILTER (WHERE t.kakeibo_envelope = 'culture'), 0) AS culture,
                        COALESCE(SUM(t.amount) FILTER (WHERE t.kakeibo_envelope = 'unexpected'), 0) AS unexpected,
                        COALESCE(SUM(t.amount) FILTER (WHERE t.kakeibo_envelope IS NULL), 0) AS unclassified,
                        COUNT(*) AS transactions
                      FROM transactions AS t JOIN categories AS c ON c.id = t.category_id
                      WHERE c.type = 'expense' AND t.transaction_date >= %s AND t.transaction_date < %s{account_clause}
                      GROUP BY t.transaction_date
                    )
                    SELECT days.day, COALESCE(a.expenses, 0) AS expenses, COALESCE(a.needs, 0) AS needs,
                      COALESCE(a.wants, 0) AS wants, COALESCE(a.culture, 0) AS culture,
                      COALESCE(a.unexpected, 0) AS unexpected, COALESCE(a.unclassified, 0) AS unclassified,
                      COALESCE(a.transactions, 0) AS transactions
                    FROM days LEFT JOIN actuals AS a ON a.day = days.day ORDER BY days.day""",
                (start_date, end_date, start_date, end_exclusive, *account_parameter),
            ).fetchall()
            expense_transactions = sum(int(row["transactions"]) for row in daily_rows)

    envelopes = ("needs", "wants", "culture", "unexpected")
    cents = Decimal("0.01")

    def month_fields(row: dict[str, object]) -> dict[str, object]:
        month_first: date = row["month"]  # type: ignore[assignment]
        next_month = (month_first.replace(day=28) + timedelta(days=4)).replace(day=1)
        income = Decimal(row["income"])  # type: ignore[arg-type]
        expenses = Decimal(row["expenses"])  # type: ignore[arg-type]
        return {
            "month": month_first.isoformat()[:7],
            "income": format_money(income),
            "expenses": format_money(expenses),
            "surplus": format_money(income - expenses),
            # Expenses as a share of income, one decimal, half-up. None (not infinity) when there was no income.
            "expense_to_income_percent": None if income == 0 else str((expenses * 100 / income).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
            # True when the requested range covers every day of this calendar month; otherwise it is month-to-date or partial.
            "complete": start_date <= month_first and end_date >= next_month - timedelta(days=1),
        }

    def detail_sections() -> dict[str, object]:
        if not detail:
            return {}
        daily = [{
            "date": row["day"].isoformat(), "expenses": format_money(row["expenses"]),
            **{key: format_money(row[key]) for key in (*envelopes, "unclassified")},
        } for row in daily_rows]
        days = len(daily)
        total = sum((Decimal(row["expenses"]) for row in daily_rows), Decimal("0"))
        # Weekday averages divide by how many times that weekday occurs in the range, zero-spend days included.
        weekdays = []
        for iso_day in range(1, 8):
            matching = [row for row in daily_rows if row["day"].isoweekday() == iso_day]
            weekday_total = sum((Decimal(row["expenses"]) for row in matching), Decimal("0"))
            weekdays.append({
                "weekday": iso_day, "total": format_money(weekday_total), "occurrences": len(matching),
                "average": format_money((weekday_total / len(matching)).quantize(cents, rounding=ROUND_HALF_UP)) if matching else format_money(Decimal("0")),
            })
        highest = max(daily_rows, key=lambda row: (Decimal(row["expenses"]), -row["day"].toordinal()), default=None) if total > 0 else None
        return {
            "daily": daily,
            "weekdays": weekdays,
            "insights": {
                "days": days,
                "average_daily_spending": format_money((total / days).quantize(cents, rounding=ROUND_HALF_UP)) if days else format_money(Decimal("0")),
                "expense_transactions": expense_transactions,
                "highest_day": None if highest is None else {"date": highest["day"].isoformat(), "expenses": format_money(highest["expenses"])},
                "zero_spend_days": sum(1 for row in daily_rows if Decimal(row["expenses"]) == 0),
            },
        }

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "account_id": account_id,
        "totals": totals,
        "previous_totals": comparison,
        "months": [month_fields(row) for row in monthly_rows],
        "categories": [{
            "id": row["id"], "name": row["name"], "icon_key": row["icon_key"], "color_key": row["color_key"],
            "archived": row["is_archived"], "expenses": format_money(row["expenses"]),
        } for row in category_rows],
        "kakeibo_totals": {key: format_money(envelope_totals[key]) for key in (*envelopes, "unclassified")},
        "kakeibo": [{
            "month": row["month"].isoformat()[:7],
            "plan_status": "not_saved" if not row["has_plan"] or row["plan_presence"] == "not_saved" else "saved" if row["plan_presence"] == "saved" else "legacy_unknown",
            "limits": None if row["plan_presence"] != "saved" else {key: format_money(row[f"{key}_limit"]) for key in envelopes},
            "actuals": {key: format_money(row[key]) for key in envelopes},
            "unclassified": format_money(row["unclassified"]),
        } for row in envelope_rows],
        **detail_sections(),
    }


@app.get("/api/kakeibo/months/{month}")
def get_kakeibo_month(month: str) -> dict[str, object]:
    with open_connection() as connection:
        return kakeibo_month_response(connection, month)


@app.put("/api/kakeibo/months/{month}")
def save_kakeibo_month(month: str, values: KakeiboMonthPlanInput) -> dict[str, object]:
    start_date, _end_date = month_bounds(month)
    with open_connection() as connection:
        connection.execute(
            """
            INSERT INTO kakeibo_month_plans (
              month, planned_income, allocated_starting_funds, savings_target,
              prior_period_debt_reserve, needs_limit, wants_limit, culture_limit,
              unexpected_limit, monthly_intention, plan_presence
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'saved')
            ON CONFLICT (month) DO UPDATE SET
              planned_income = EXCLUDED.planned_income,
              allocated_starting_funds = EXCLUDED.allocated_starting_funds,
              savings_target = EXCLUDED.savings_target,
              prior_period_debt_reserve = EXCLUDED.prior_period_debt_reserve,
              needs_limit = EXCLUDED.needs_limit,
              wants_limit = EXCLUDED.wants_limit,
              culture_limit = EXCLUDED.culture_limit,
              unexpected_limit = EXCLUDED.unexpected_limit,
              monthly_intention = EXCLUDED.monthly_intention,
              plan_presence = 'saved',
              updated_at = NOW()
            """,
            (
                start_date,
                values.planned_income,
                values.allocated_starting_funds,
                values.savings_target,
                values.prior_period_debt_reserve,
                values.needs_limit,
                values.wants_limit,
                values.culture_limit,
                values.unexpected_limit,
                values.monthly_intention,
            ),
        )
        return kakeibo_month_response(connection, month)


@app.get("/api/kakeibo/months/{month}/report")
def get_kakeibo_month_report(month: str) -> dict[str, object]:
    with open_connection() as connection:
        return kakeibo_month_response(connection, month)


@app.put("/api/kakeibo/months/{month}/review")
def save_kakeibo_month_review(month: str, values: KakeiboMonthReviewInput) -> dict[str, object]:
    start_date, end_date = month_bounds(month)
    with open_connection() as connection:
        actuals = kakeibo_actuals(connection, start_date, end_date)
        snapshot = {
            "actual_income": format_money(actuals["actual_income"]),
            "total_expenses": format_money(actuals["total_expenses"]),
            "unclassified": format_money(actuals["unclassified"]),
            "envelopes": {
                envelope: format_money(actuals[envelope])
                for envelope in ("needs", "wants", "culture", "unexpected")
            },
        }
        connection.execute(
            """
            INSERT INTO kakeibo_month_plans (
              month, plan_presence, actual_saved_declared, review_available, review_savings,
              review_change, review_appreciated, review_surprise, review_lesson,
              reviewed_at, review_actuals_snapshot
            )
            VALUES (%s, 'not_saved', %s, %s, %s, %s, %s, %s, %s, NOW(), %s)
            ON CONFLICT (month) DO UPDATE SET
              actual_saved_declared = EXCLUDED.actual_saved_declared,
              review_available = EXCLUDED.review_available,
              review_savings = EXCLUDED.review_savings,
              review_change = EXCLUDED.review_change,
              review_appreciated = EXCLUDED.review_appreciated,
              review_surprise = EXCLUDED.review_surprise,
              review_lesson = EXCLUDED.review_lesson,
              reviewed_at = NOW(),
              review_actuals_snapshot = EXCLUDED.review_actuals_snapshot,
              updated_at = NOW()
            """,
            (
                start_date,
                values.actual_saved_declared,
                values.review_available,
                values.review_savings,
                values.review_change,
                values.review_appreciated,
                values.review_surprise,
                values.review_lesson,
                Jsonb(snapshot),
            ),
        )
        return kakeibo_month_response(connection, month)


def kakeibo_week_response(
    connection: psycopg.Connection,
    week_start: date,
    week_end: date,
    end_exclusive: date,
) -> dict[str, object]:
    actuals = kakeibo_actuals(connection, week_start, end_exclusive)
    review = connection.execute(
        """
        SELECT week_start, surprise_note, worthwhile_note, next_week_intention,
               created_at, updated_at
        FROM kakeibo_weekly_reviews
        WHERE week_start = %s
        """,
        (week_start,),
    ).fetchone()
    review_response = None
    if review is not None:
        review_response = {
            "surprise_note": review["surprise_note"],
            "worthwhile_note": review["worthwhile_note"],
            "next_week_intention": review["next_week_intention"],
            "created_at": format_timestamp(review["created_at"]),
            "updated_at": format_timestamp(review["updated_at"]),
        }
    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "spending_by_envelope": {
            envelope: format_money(actuals[envelope])
            for envelope in ("needs", "wants", "culture", "unexpected")
        },
        "unclassified_expenses": format_money(actuals["unclassified"]),
        "total_expenses": format_money(actuals["total_expenses"]),
        "review": review_response,
    }


@app.get("/api/kakeibo/weeks/{week_start}")
def get_kakeibo_week(week_start: str) -> dict[str, object]:
    start_date, end_date, end_exclusive = week_bounds(week_start)
    with open_connection() as connection:
        return kakeibo_week_response(connection, start_date, end_date, end_exclusive)


@app.put("/api/kakeibo/weeks/{week_start}")
def save_kakeibo_week(week_start: str, values: KakeiboWeekReviewInput) -> dict[str, object]:
    start_date, end_date, end_exclusive = week_bounds(week_start)
    with open_connection() as connection:
        connection.execute(
            """
            INSERT INTO kakeibo_weekly_reviews (
              week_start, surprise_note, worthwhile_note, next_week_intention
            )
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (week_start) DO UPDATE SET
              surprise_note = EXCLUDED.surprise_note,
              worthwhile_note = EXCLUDED.worthwhile_note,
              next_week_intention = EXCLUDED.next_week_intention,
              updated_at = NOW()
            """,
            (start_date, values.surprise_note, values.worthwhile_note, values.next_week_intention),
        )
        return kakeibo_week_response(connection, start_date, end_date, end_exclusive)
