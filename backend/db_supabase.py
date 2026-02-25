"""Supabase database operations for users, saved pitchers, subscriptions, and notifications."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from supabase import create_client, Client


def _client() -> Client:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    return create_client(url, key)


# ── Saved Pitchers ─────────────────────────────────────────────────────────────

def get_saved_pitchers(user_id: str) -> list[dict]:
    result = (
        _client()
        .table("saved_pitchers")
        .select("pitcher_name, pitcher_idfg, added_at")
        .eq("user_id", user_id)
        .order("added_at")
        .execute()
    )
    return result.data or []


def add_saved_pitcher(user_id: str, pitcher_name: str, pitcher_idfg: int | None) -> dict:
    result = (
        _client()
        .table("saved_pitchers")
        .upsert(
            {"user_id": user_id, "pitcher_name": pitcher_name, "pitcher_idfg": pitcher_idfg},
            on_conflict="user_id,pitcher_name",
        )
        .execute()
    )
    return result.data[0] if result.data else {}


def remove_saved_pitcher(user_id: str, pitcher_name: str) -> None:
    (
        _client()
        .table("saved_pitchers")
        .delete()
        .eq("user_id", user_id)
        .eq("pitcher_name", pitcher_name)
        .execute()
    )


# ── Subscriptions ──────────────────────────────────────────────────────────────

def get_subscription(user_id: str) -> dict:
    result = (
        _client()
        .table("subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    if result.data:
        return result.data[0]
    return {"user_id": user_id, "status": "inactive", "current_period_end": None}


def upsert_subscription(user_id: str, data: dict) -> None:
    data["user_id"] = user_id
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _client().table("subscriptions").upsert(data, on_conflict="user_id").execute()


def is_active_subscriber(user_id: str) -> bool:
    sub = get_subscription(user_id)
    if sub.get("status") != "active":
        return False
    end = sub.get("current_period_end")
    if end:
        try:
            end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
            if end_dt < datetime.now(timezone.utc):
                return False
        except (ValueError, TypeError):
            pass
    return True


# ── Notification Settings ──────────────────────────────────────────────────────

def get_notification_settings(user_id: str) -> dict:
    result = (
        _client()
        .table("notification_settings")
        .select("enabled, notification_email")
        .eq("user_id", user_id)
        .execute()
    )
    if result.data:
        return result.data[0]
    return {"enabled": False, "notification_email": None}


def upsert_notification_settings(
    user_id: str, enabled: bool, notification_email: str | None
) -> None:
    _client().table("notification_settings").upsert(
        {
            "user_id": user_id,
            "enabled": enabled,
            "notification_email": notification_email,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id",
    ).execute()


# ── Weekly Email Job ───────────────────────────────────────────────────────────

def get_all_notifiable_users() -> list[dict]:
    """Return users with notifications enabled AND an active subscription."""
    sb = _client()

    notif_res = (
        sb.table("notification_settings")
        .select("user_id, notification_email")
        .eq("enabled", True)
        .execute()
    )
    notif_map: dict[str, str] = {
        row["user_id"]: row["notification_email"]
        for row in (notif_res.data or [])
        if row.get("notification_email")
    }
    if not notif_map:
        return []

    sub_res = (
        sb.table("subscriptions")
        .select("user_id")
        .eq("status", "active")
        .in_("user_id", list(notif_map.keys()))
        .execute()
    )
    active_ids = {row["user_id"] for row in (sub_res.data or [])}

    users = []
    for uid in active_ids:
        pitchers = get_saved_pitchers(uid)
        users.append(
            {"user_id": uid, "email": notif_map[uid], "pitchers": pitchers}
        )
    return users
