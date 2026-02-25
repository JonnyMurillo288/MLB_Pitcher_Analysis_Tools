"""
Email service for weekly pitcher notifications.

- Production:  sends via SendGrid API
- TEST_MODE:   sends via SMTP to Mailpit (http://localhost:8025 to view)
- Template:    backend/templates/weekly_email.html  ← edit this file to change the email design
"""

from __future__ import annotations

import os
import logging
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

TEST_MODE        = os.getenv("TEST_MODE", "") == "1"
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
FROM_EMAIL       = os.getenv("SENDGRID_FROM_EMAIL", "noreply@pitcheranalyzer.dev")
FROM_NAME        = os.getenv("SENDGRID_FROM_NAME", "Pitcher Trend Analyzer")
APP_URL          = os.getenv("APP_URL", "http://localhost:5173")
SMTP_HOST        = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT        = int(os.getenv("SMTP_PORT", "1025"))

# Jinja2 env — templates live in backend/templates/
_TEMPLATE_DIR = Path(__file__).parent / "templates"
_jinja = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)


def render_email_html(pitchers: list[dict]) -> str:
    """
    Render the weekly email HTML from the Jinja2 template.

    Edit  backend/templates/weekly_email.html  to change the design.
    Available template variables:
      {{ pitchers }}   — list of dicts with 'pitcher_name' key
      {{ app_url }}    — link back to the app
      {{ send_date }}  — today's date string
    """
    template = _jinja.get_template("weekly_email.html")
    return template.render(
        pitchers=pitchers,
        app_url=APP_URL,
        send_date=datetime.now(timezone.utc).strftime("%B %d, %Y"),
    )


def _send_via_smtp(to_email: str, html: str) -> bool:
    """Send via SMTP (used in TEST_MODE — delivers to Mailpit)."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "⚾ Your Weekly Pitcher Watch"
    msg["From"]    = f"{FROM_NAME} <{FROM_EMAIL}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5) as s:
            s.sendmail(FROM_EMAIL, [to_email], msg.as_string())
        logger.info("Email sent via SMTP to %s (mailpit on %s:%s)", to_email, SMTP_HOST, SMTP_PORT)
        return True
    except Exception as exc:
        logger.error("SMTP send failed to %s: %s", to_email, exc)
        return False


def _send_via_sendgrid(to_email: str, html: str) -> bool:
    """Send via SendGrid API (used in production)."""
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail, Email, To, Content

        sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        message = Mail(
            from_email=Email(FROM_EMAIL, FROM_NAME),
            to_emails=To(to_email),
            subject="⚾ Your Weekly Pitcher Watch",
            html_content=Content("text/html", html),
        )
        response = sg.client.mail.send.post(request_body=message.get())
        if response.status_code in (200, 202):
            logger.info("Email sent via SendGrid to %s", to_email)
            return True
        logger.error("SendGrid returned %s for %s", response.status_code, to_email)
        return False
    except Exception as exc:
        logger.error("SendGrid failed for %s: %s", to_email, exc)
        return False


def send_weekly_notification(to_email: str, pitchers: list[dict]) -> bool:
    """
    Send a weekly notification email. Returns True on success.

    In TEST_MODE:   delivers to Mailpit  → http://localhost:8025
    In production:  delivers via SendGrid (requires SENDGRID_API_KEY)
    """
    html = render_email_html(pitchers)

    if TEST_MODE:
        return _send_via_smtp(to_email, html)

    if not SENDGRID_API_KEY or SENDGRID_API_KEY.startswith("SG.your"):
        logger.warning("SendGrid API key not configured — skipping email to %s", to_email)
        return False

    return _send_via_sendgrid(to_email, html)
