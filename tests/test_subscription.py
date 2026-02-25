"""Tests for subscription status endpoint."""


class TestGetSubscription:
    def test_paid_user_has_active_subscription(self, paid_client):
        resp = paid_client.get("/api/user/subscription")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "active"
        assert data["stripe_customer_id"] == "cus_dev_paid_001"
        assert data["stripe_subscription_id"] == "sub_dev_paid_001"
        assert data["current_period_end"] is not None

    def test_free_user_has_no_subscription(self, free_client):
        resp = free_client.get("/api/user/subscription")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "inactive"

    def test_subscription_has_required_fields(self, paid_client):
        resp = paid_client.get("/api/user/subscription")
        data = resp.json()
        for field in ("status", "stripe_customer_id", "stripe_subscription_id", "current_period_end"):
            assert field in data, f"Missing field: {field}"


class TestCreateCheckoutSession:
    def test_checkout_returns_503_when_stripe_not_configured(self, paid_client):
        """In the Docker dev env, Stripe keys are empty — expect 503."""
        resp = paid_client.post("/api/user/subscription/checkout")
        assert resp.status_code == 503
        assert "Stripe" in resp.json()["detail"]
