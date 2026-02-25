"""APScheduler: fire weekly pitcher notification emails every Monday at 9 AM."""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

import db
import email_service

logger = logging.getLogger(__name__)


def send_weekly_emails() -> None:
    """Job function: fetch all notifiable users and send their weekly emails."""
    logger.info("Starting weekly email job...")
    users = db.get_all_notifiable_users()
    logger.info("Found %d users to notify", len(users))

    sent = 0
    for user in users:
        ok = email_service.send_weekly_notification(
            to_email=user["email"],
            pitchers=user["pitchers"],
        )
        if ok:
            sent += 1

    logger.info("Weekly email job complete: %d/%d sent", sent, len(users))


def create_scheduler() -> BackgroundScheduler:
    """Create and configure the scheduler. Call start() on the returned instance."""
    scheduler = BackgroundScheduler(timezone="America/New_York")
    scheduler.add_job(
        send_weekly_emails,
        trigger=CronTrigger(day_of_week="mon", hour=9, minute=0),
        id="weekly_pitcher_emails",
        replace_existing=True,
    )
    return scheduler
