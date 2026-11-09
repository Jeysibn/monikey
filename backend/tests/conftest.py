from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from database import open_connection
from main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def empty_financial_records():
    """Give each test the same fictional ledger and default category catalog."""
    with open_connection() as connection:
        connection.execute(
            "TRUNCATE kakeibo_weekly_reviews, kakeibo_month_plans, credit_card_payments, transactions, accounts, categories RESTART IDENTITY CASCADE"
        )
        connection.execute(
            """INSERT INTO categories (name, type) VALUES
                 ('Salary', 'income'), ('Freelance', 'income'), ('Other', 'income'),
                 ('Food', 'expense'), ('Transportation', 'expense'), ('Groceries', 'expense'),
                 ('Bills', 'expense'), ('Shopping', 'expense'), ('Other', 'expense')"""
        )
    yield
