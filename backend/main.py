"""MoniKey v1 REST API. Monetary totals are calculated with PostgreSQL NUMERIC."""

from __future__ import annotations

import logging
import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

import psycopg
from fastapi import FastAPI, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints
from starlette.exceptions import HTTPException as StarletteHTTPException

from database import DatabaseConfigurationError, open_connection

logger = logging.getLogger("monikey.api")

AccountType = Literal["cash", "bank", "ewallet", "credit_card"]
CategoryType = Literal["income", "expense"]
MoneyPattern = re.compile(r"^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$")
DatePattern = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
MonthPattern = re.compile(r"^[0-9]{4}-(?:0[1-9]|1[0-2])$")
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
PositiveMoney = Annotated[Money, Field(gt=0)]
CalendarDate = Annotated[date, BeforeValidator(parse_calendar_date)]
AccountName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Note = Annotated[str | None, BeforeValidator(normalize_note)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AccountInput(InputModel):
    name: AccountName
    type: AccountType
    opening_balance: Money = Decimal("0.00")
    opening_debt: Money = Decimal("0.00")
    credit_limit: Money | None = None


class TransactionInput(InputModel):
    account_id: Annotated[int, Field(gt=0)]
    category_id: Annotated[int, Field(gt=0)]
    amount: PositiveMoney
    transaction_date: CalendarDate
    note: Note = None


class PaymentInput(InputModel):
    source_account_id: Annotated[int, Field(gt=0)]
    card_account_id: Annotated[int, Field(gt=0)]
    amount: PositiveMoney
    payment_date: CalendarDate
    note: Note = None


class ApiProblem(Exception):
    def __init__(self, status: int, code: str, message: str, field: str | None = None):
        self.status = status
        self.code = code
        self.message = message
        self.field = field


app = FastAPI(title="MoniKey API", version="1.0.0")


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


def account_positions_sql() -> str:
    """Return each account's computed position without joining two one-to-many tables."""
    return """
        SELECT
          a.id,
          a.name,
          a.type,
          a.credit_limit,
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


def validate_account_input(values: AccountInput) -> None:
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
) -> None:
    row = connection.execute(
        """
        SELECT a.type AS account_type, c.type AS category_type
        FROM accounts AS a
        LEFT JOIN categories AS c ON c.id = %s
        WHERE a.id = %s
        """,
        (values.category_id, values.account_id),
    ).fetchone()
    if row is None:
        raise ApiProblem(400, "invalid_field", "Choose an existing account.", "account_id")
    if row["category_type"] is None:
        raise ApiProblem(400, "invalid_field", "Choose an existing category.", "category_id")
    if expected_category_type is not None and row["category_type"] != expected_category_type:
        raise ApiProblem(400, "invalid_account_type_combination", "Keep the transaction's income or expense category type when editing.", "category_id")
    if row["account_type"] == "credit_card" and row["category_type"] != "expense":
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


def transaction_response(row: dict[str, object]) -> dict[str, object]:
    return {
        "id": row["id"],
        "account_id": row["account_id"],
        "category_id": row["category_id"],
        "amount": format_money(row["amount"]),
        "transaction_date": row["transaction_date"].isoformat(),
        "note": row["note"],
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


def get_transaction(connection: psycopg.Connection, record_id: int) -> dict[str, object]:
    row = connection.execute(
        """
        SELECT id, account_id, category_id, amount, transaction_date, note, created_at
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
                INSERT INTO accounts (name, type, opening_balance, opening_debt, credit_limit)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (values.name, values.type, values.opening_balance, values.opening_debt, values.credit_limit),
            ).fetchone()
            account = connection.execute(
                f"{account_positions_sql()} WHERE a.id = %s",
                (row["id"],),
            ).fetchone()
        return account_response(account)
    except psycopg.errors.UniqueViolation:
        raise ApiProblem(409, "duplicate_account_name", "An account with this name already exists.", "name") from None


@app.get("/api/categories")
def list_categories(category_type: CategoryType | None = Query(default=None, alias="type")) -> list[dict[str, object]]:
    query = "SELECT id, name, type FROM categories"
    parameters: tuple[object, ...] = ()
    if category_type is not None:
        query += " WHERE type = %s"
        parameters = (category_type,)
    query += " ORDER BY type, name, id"
    with open_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return rows


@app.get("/api/transactions")
def list_transactions(
    month: str,
    account_id: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=1001)] = 50,
) -> list[dict[str, object]]:
    start_date, end_date = month_bounds(month)
    query = """
        SELECT t.id, t.account_id, t.category_id, t.amount, t.transaction_date, t.note, t.created_at
        FROM transactions AS t
        WHERE t.transaction_date >= %s AND t.transaction_date < %s
    """
    parameters: list[object] = [start_date, end_date]
    if account_id is not None:
        query += " AND t.account_id = %s"
        parameters.append(account_id)
    query += " ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC LIMIT %s"
    parameters.append(limit)
    with open_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [transaction_response(row) for row in rows]


@app.post("/api/transactions", status_code=201)
def create_transaction(values: TransactionInput) -> dict[str, object]:
    with open_connection() as connection:
        validate_transaction_references(connection, values)
        row = connection.execute(
            """
            INSERT INTO transactions (account_id, category_id, amount, transaction_date, note)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, account_id, category_id, amount, transaction_date, note, created_at
            """,
            (values.account_id, values.category_id, values.amount, values.transaction_date, values.note),
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
            SELECT c.type AS category_type
            FROM transactions AS t
            JOIN categories AS c ON c.id = t.category_id
            WHERE t.id = %s
            """,
            (record_id,),
        ).fetchone()
        if existing is None:
            raise ApiProblem(404, "not_found", "Transaction not found.")
        validate_transaction_references(connection, values, existing["category_type"])
        row = connection.execute(
            """
            UPDATE transactions
            SET account_id = %s, category_id = %s, amount = %s, transaction_date = %s, note = %s
            WHERE id = %s
            RETURNING id, account_id, category_id, amount, transaction_date, note, created_at
            """,
            (values.account_id, values.category_id, values.amount, values.transaction_date, values.note, record_id),
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
) -> list[dict[str, object]]:
    start_date, end_date = month_bounds(month)
    query = """
        SELECT p.id, p.source_account_id, p.card_account_id, p.amount, p.payment_date, p.note, p.created_at
        FROM credit_card_payments AS p
        WHERE p.payment_date >= %s AND p.payment_date < %s
    """
    parameters: list[object] = [start_date, end_date]
    if account_id is not None:
        query += " AND (p.source_account_id = %s OR p.card_account_id = %s)"
        parameters.extend((account_id, account_id))
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
