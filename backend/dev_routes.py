"""
Dev-only FastAPI router — only mounted when TEST_MODE=1.

Endpoints:
  GET  /dev/email-preview          Preview the weekly email in browser
  POST /dev/send-test-email        Send a test email through Mailpit
  POST /dev/trigger-weekly-emails  Run the Monday email job right now
  GET  /dev/seed-status            Show what's in the local DB
  POST /dev/reset-pitcher/{name}   Remove a pitcher from the paid test user (for test cleanup)
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse

from auth import TEST_PAID_USER_ID, TEST_FREE_USER_ID
import db
import email_service

router = APIRouter(prefix="/dev", tags=["dev (TEST_MODE only)"])


@router.get(
    "/email-preview",
    response_class=HTMLResponse,
    summary="Preview the weekly email HTML in the browser",
)
async def email_preview(
    pitchers: str = Query(
        default="Gerrit Cole,Jacob deGrom,Max Scherzer",
        description="Comma-separated pitcher names to include in preview",
    )
):
    """
    Renders weekly_email.html with the given pitchers.
    Edit  backend/templates/weekly_email.html  and refresh to see changes instantly.
    """
    pitcher_list = [
        {"pitcher_name": p.strip()} for p in pitchers.split(",") if p.strip()
    ]
    html = email_service.render_email_html(pitcher_list)
    return HTMLResponse(content=html)


@router.post(
    "/send-test-email",
    summary="Send a test email via Mailpit (view at http://localhost:8025)",
)
async def send_test_email(
    to: str = Query(default="test@example.com"),
    pitchers: str = Query(default="Gerrit Cole,Jacob deGrom,Max Scherzer"),
):
    pitcher_list = [
        {"pitcher_name": p.strip()} for p in pitchers.split(",") if p.strip()
    ]
    ok = await run_in_threadpool(email_service.send_weekly_notification, to, pitcher_list)
    return {
        "sent": ok,
        "to": to,
        "pitchers": pitcher_list,
        "mailpit_url": "http://localhost:8025",
    }


@router.post(
    "/trigger-weekly-emails",
    summary="Run the Monday morning email job right now",
)
async def trigger_weekly_emails():
    """Triggers the scheduler job immediately — useful for smoke testing the full email pipeline."""
    from scheduler import send_weekly_emails
    await run_in_threadpool(send_weekly_emails)
    return {"triggered": True, "mailpit_url": "http://localhost:8025"}


@router.get(
    "/seed-status",
    summary="Show the seeded test account state",
)
async def seed_status():
    """
    Returns the current DB state for both seeded test users.

    Paid user:  X-Dev-User-ID: 00000000-0000-0000-0000-000000000001
    Free user:  X-Dev-User-ID: 00000000-0000-0000-0000-000000000002
    """
    paid_pitchers  = await run_in_threadpool(db.get_saved_pitchers,          TEST_PAID_USER_ID)
    paid_sub       = await run_in_threadpool(db.get_subscription,             TEST_PAID_USER_ID)
    paid_notif     = await run_in_threadpool(db.get_notification_settings,    TEST_PAID_USER_ID)
    free_pitchers  = await run_in_threadpool(db.get_saved_pitchers,          TEST_FREE_USER_ID)
    free_sub       = await run_in_threadpool(db.get_subscription,             TEST_FREE_USER_ID)
    free_notif     = await run_in_threadpool(db.get_notification_settings,    TEST_FREE_USER_ID)

    return {
        "paid_user": {
            "id":             TEST_PAID_USER_ID,
            "email":          "test-paid@example.com",
            "subscription":   paid_sub,
            "saved_pitchers": paid_pitchers,
            "notifications":  paid_notif,
        },
        "free_user": {
            "id":             TEST_FREE_USER_ID,
            "email":          "test-free@example.com",
            "subscription":   free_sub,
            "saved_pitchers": free_pitchers,
            "notifications":  free_notif,
        },
    }
