"""Local Postgres DB layer using psycopg2. Used in Docker / TEST_MODE instead of Supabase."""

from __future__ import annotations

import os
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras


def _conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def _isoformat(val) -> str | None:
    """Convert a datetime (from psycopg2) to ISO string, or pass through strings."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


# ── Saved Pitchers ─────────────────────────────────────────────────────────────

def get_saved_pitchers(user_id: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT pitcher_name, pitcher_idfg, added_at "
                "FROM saved_pitchers WHERE user_id = %s ORDER BY added_at",
                (user_id,),
            )
            rows = cur.fetchall()
    return [
        {**dict(r), "added_at": _isoformat(r["added_at"])}
        for r in rows
    ]


def add_saved_pitcher(user_id: str, pitcher_name: str, pitcher_idfg: int | None) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO saved_pitchers (user_id, pitcher_name, pitcher_idfg)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id, pitcher_name)
                DO UPDATE SET pitcher_idfg = EXCLUDED.pitcher_idfg
                RETURNING pitcher_name, pitcher_idfg, added_at
                """,
                (user_id, pitcher_name, pitcher_idfg),
            )
            row = cur.fetchone()
        conn.commit()
    return {**dict(row), "added_at": _isoformat(row["added_at"])} if row else {}


def remove_saved_pitcher(user_id: str, pitcher_name: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM saved_pitchers WHERE user_id = %s AND pitcher_name = %s",
                (user_id, pitcher_name),
            )
        conn.commit()


# ── Subscriptions ──────────────────────────────────────────────────────────────

def get_subscription(user_id: str) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM subscriptions WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    if row:
        d = dict(row)
        d["current_period_end"] = _isoformat(d.get("current_period_end"))
        d["created_at"] = _isoformat(d.get("created_at"))
        d["updated_at"] = _isoformat(d.get("updated_at"))
        return d
    return {"user_id": user_id, "status": "inactive", "current_period_end": None}


def upsert_subscription(user_id: str, data: dict) -> None:
    data = {**data, "user_id": user_id, "updated_at": datetime.now(timezone.utc)}
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO subscriptions
                  (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
                VALUES (%(user_id)s, %(stripe_customer_id)s, %(stripe_subscription_id)s,
                        %(status)s, %(current_period_end)s, %(updated_at)s)
                ON CONFLICT (user_id) DO UPDATE SET
                  stripe_customer_id     = EXCLUDED.stripe_customer_id,
                  stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                  status                 = EXCLUDED.status,
                  current_period_end     = EXCLUDED.current_period_end,
                  updated_at             = EXCLUDED.updated_at
                """,
                {
                    "stripe_customer_id": data.get("stripe_customer_id"),
                    "stripe_subscription_id": data.get("stripe_subscription_id"),
                    "status": data.get("status", "inactive"),
                    "current_period_end": data.get("current_period_end"),
                    **data,
                },
            )
        conn.commit()


def is_active_subscriber(user_id: str) -> bool:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM subscriptions
                WHERE user_id = %s
                  AND status = 'active'
                  AND (current_period_end IS NULL OR current_period_end > NOW())
                """,
                (user_id,),
            )
            return cur.fetchone() is not None


# ── Notification Settings ──────────────────────────────────────────────────────

def get_notification_settings(user_id: str) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT enabled, notification_email FROM notification_settings WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
    return dict(row) if row else {"enabled": False, "notification_email": None}


def upsert_notification_settings(
    user_id: str, enabled: bool, notification_email: str | None
) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO notification_settings (user_id, enabled, notification_email, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                  enabled            = EXCLUDED.enabled,
                  notification_email = EXCLUDED.notification_email,
                  updated_at         = NOW()
                """,
                (user_id, enabled, notification_email),
            )
        conn.commit()


# ── Weekly Email Job ───────────────────────────────────────────────────────────

def get_all_notifiable_users() -> list[dict]:
    """Return users with notifications enabled AND an active subscription."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT ns.user_id, ns.notification_email
                FROM notification_settings ns
                JOIN subscriptions s ON s.user_id = ns.user_id
                WHERE ns.enabled = TRUE
                  AND ns.notification_email IS NOT NULL
                  AND s.status = 'active'
                  AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
                """
            )
            rows = cur.fetchall()

    users = []
    for row in rows:
        pitchers = get_saved_pitchers(str(row["user_id"]))
        users.append(
            {"user_id": str(row["user_id"]), "email": row["notification_email"], "pitchers": pitchers}
        )
    return users
