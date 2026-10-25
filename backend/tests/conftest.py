from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from database import open_connection
from main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def empty_financial_records() -> None:
    """Keep each test independent while preserving the seeded categories."""
    with open_connection() as connection:
        connection.execute(
            "TRUNCATE credit_card_payments, transactions, accounts RESTART IDENTITY CASCADE"
        )
