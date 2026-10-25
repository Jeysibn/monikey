"""Small PostgreSQL connection helper for request-scoped operations."""

from __future__ import annotations

import os

import psycopg
from psycopg.rows import dict_row


class DatabaseConfigurationError(RuntimeError):
    """Raised when the API has no database connection string configured."""


def open_connection() -> psycopg.Connection:
    """Open one connection; its context manager commits or rolls back and closes it."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise DatabaseConfigurationError("DATABASE_URL is required")

    return psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=3,
    )
