"""
Tests for email rendering and the dev email endpoints.

The /dev/* routes are only mounted in TEST_MODE=1 (which conftest sets).
Actual SMTP delivery goes to Mailpit — check http://localhost:8025 to see sent emails.
"""

import pytest


SAMPLE_PITCHERS = [
    {"pitcher_name": "Gerrit Cole"},
    {"pitcher_name": "Jacob deGrom"},
    {"pitcher_name": "Max Scherzer"},
]


class TestEmailRendering:
    def test_render_with_pitchers(self):
        """Template renders pitcher names into the HTML."""
        from email_service import render_email_html

        html = render_email_html(SAMPLE_PITCHERS)
        assert "Gerrit Cole" in html
        assert "Jacob deGrom" in html
        assert "Max Scherzer" in html

    def test_render_empty_pitcher_list(self):
        """Empty list renders the 'no pitchers' state, not an error."""
        from email_service import render_email_html

        html = render_email_html([])
        assert html  # not empty
        assert "Gerrit Cole" not in html

    def test_render_includes_app_url(self):
        from email_service import render_email_html, APP_URL

        html = render_email_html(SAMPLE_PITCHERS)
        assert APP_URL in html

    def test_render_includes_send_date(self):
        from email_service import render_email_html

        html = render_email_html(SAMPLE_PITCHERS)
        # Date should appear somewhere in the HTML (format: "Month DD, YYYY")
        from datetime import datetime, timezone
        year = str(datetime.now(timezone.utc).year)
        assert year in html

    def test_template_is_valid_html(self):
        from email_service import render_email_html

        html = render_email_html(SAMPLE_PITCHERS)
        assert "<!DOCTYPE html>" in html
        assert "</html>" in html


class TestEmailPreviewEndpoint:
    def test_preview_returns_html(self, paid_client):
        resp = paid_client.get("/dev/email-preview")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]

    def test_preview_with_custom_pitchers(self, paid_client):
        resp = paid_client.get(
            "/dev/email-preview",
            params={"pitchers": "Sandy Alcantara,Shane McClanahan"},
        )
        assert resp.status_code == 200
        assert "Sandy Alcantara" in resp.text
        assert "Shane McClanahan" in resp.text

    def test_preview_with_empty_pitchers_param(self, paid_client):
        resp = paid_client.get("/dev/email-preview", params={"pitchers": ""})
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]


class TestSendTestEmail:
    def test_send_test_email_returns_ok(self, paid_client):
        """
        Sends email via SMTP to Mailpit. Response says sent=True if SMTP succeeded.
        View the email at http://localhost:8025
        """
        resp = paid_client.post(
            "/dev/send-test-email",
            params={"to": "inbox@test.local", "pitchers": "Gerrit Cole,Max Scherzer"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # In Docker, Mailpit is running → sent should be True.
        # Outside Docker (no SMTP), it may be False — that's acceptable in CI.
        assert "sent" in data
        assert "mailpit_url" in data

    def test_send_test_email_response_shape(self, paid_client):
        resp = paid_client.post(
            "/dev/send-test-email",
            params={"to": "test@example.com"},
        )
        data = resp.json()
        assert "to" in data
        assert "pitchers" in data
        assert isinstance(data["pitchers"], list)


class TestDevSeedStatus:
    def test_seed_status_returns_both_users(self, paid_client):
        resp = paid_client.get("/dev/seed-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "paid_user" in data
        assert "free_user" in data

    def test_paid_user_seed_state(self, paid_client):
        resp = paid_client.get("/dev/seed-status")
        paid = resp.json()["paid_user"]
        assert paid["subscription"]["status"] == "active"
        assert len(paid["saved_pitchers"]) >= 3
        assert paid["notifications"]["enabled"] is True

    def test_free_user_seed_state(self, paid_client):
        resp = paid_client.get("/dev/seed-status")
        free = resp.json()["free_user"]
        assert free["subscription"]["status"] == "inactive"
        assert free["saved_pitchers"] == []
