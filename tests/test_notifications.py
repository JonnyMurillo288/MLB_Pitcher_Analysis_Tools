"""Tests for notification settings endpoints."""


class TestGetNotifications:
    def test_paid_user_notifications_enabled(self, paid_client):
        resp = paid_client.get("/api/user/notifications")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True
        assert data["notification_email"] == "test-paid@example.com"

    def test_free_user_notifications_disabled(self, free_client):
        resp = free_client.get("/api/user/notifications")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is False


class TestUpdateNotifications:
    def test_paid_user_can_disable_notifications(self, paid_client):
        resp = paid_client.put(
            "/api/user/notifications",
            json={"enabled": False, "notification_email": "test-paid@example.com"},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify the change
        get_resp = paid_client.get("/api/user/notifications")
        assert get_resp.json()["enabled"] is False

    def test_paid_user_can_re_enable_notifications(self, paid_client):
        resp = paid_client.put(
            "/api/user/notifications",
            json={"enabled": True, "notification_email": "test-paid@example.com"},
        )
        assert resp.status_code == 200

        get_resp = paid_client.get("/api/user/notifications")
        assert get_resp.json()["enabled"] is True

    def test_free_user_cannot_enable_notifications(self, free_client):
        """Enabling notifications requires an active subscription — free user should get 402."""
        resp = free_client.put(
            "/api/user/notifications",
            json={"enabled": True, "notification_email": "test-free@example.com"},
        )
        assert resp.status_code == 402
        assert "subscription" in resp.json()["detail"].lower()

    def test_free_user_can_disable_notifications(self, free_client):
        """Disabling is always allowed (even if already disabled)."""
        resp = free_client.put(
            "/api/user/notifications",
            json={"enabled": False, "notification_email": None},
        )
        assert resp.status_code == 200

    def test_can_update_notification_email(self, paid_client):
        new_email = "new-address@example.com"
        resp = paid_client.put(
            "/api/user/notifications",
            json={"enabled": True, "notification_email": new_email},
        )
        assert resp.status_code == 200

        get_resp = paid_client.get("/api/user/notifications")
        assert get_resp.json()["notification_email"] == new_email

        # Restore original
        paid_client.put(
            "/api/user/notifications",
            json={"enabled": True, "notification_email": "test-paid@example.com"},
        )
