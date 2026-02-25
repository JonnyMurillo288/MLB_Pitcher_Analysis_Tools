"""
Pytest configuration and shared fixtures.

The test suite targets the Docker environment:
  docker-compose exec backend pytest tests/

You can also run locally with the Postgres DB exposed on port 5432:
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pitcher_dev pytest tests/

TEST_MODE=1 is set here so db.py routes to db_local and auth.py uses the header bypass.
"""

import os

# ── Must be set BEFORE any app imports ────────────────────────────────────────
os.environ.setdefault("TEST_MODE", "1")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@db:5432/pitcher_dev"
)
os.environ.setdefault("SMTP_HOST", "mailpit")
os.environ.setdefault("SMTP_PORT", "1025")
os.environ.setdefault("APP_URL", "http://localhost:5173")
os.environ.setdefault("SENDGRID_FROM_EMAIL", "noreply@test.local")
os.environ.setdefault("SENDGRID_FROM_NAME", "Pitcher Analyzer Test")

import pytest
from fastapi.testclient import TestClient

# Import app after env vars are set
from main import app

# ── Fixed UUIDs matching seed.sql ─────────────────────────────────────────────
PAID_USER_ID = "00000000-0000-0000-0000-000000000001"
FREE_USER_ID = "00000000-0000-0000-0000-000000000002"


# ── Clients ───────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client():
    """Plain TestClient with no user — used for unauthenticated tests."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture(scope="session")
def paid_client():
    """TestClient authenticated as the seeded paid user."""
    with TestClient(app, raise_server_exceptions=True) as c:
        c.headers.update({"X-Dev-User-ID": PAID_USER_ID})
        yield c


@pytest.fixture(scope="session")
def free_client():
    """TestClient authenticated as the seeded free user."""
    with TestClient(app, raise_server_exceptions=True) as c:
        c.headers.update({"X-Dev-User-ID": FREE_USER_ID})
        yield c


# ── DB helpers ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=False)
def clean_extra_pitchers():
    """
    Remove any pitchers added during a test (keeps seed data intact).
    Yields the set of names to clean up. Add names to it inside your test.
    """
    added: set[str] = set()
    yield added
    if added:
        import db_local as dbl
        for name in added:
            dbl.remove_saved_pitcher(PAID_USER_ID, name)
            dbl.remove_saved_pitcher(FREE_USER_ID, name)
