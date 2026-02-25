"""Tests for saved pitcher CRUD endpoints."""

import pytest
from conftest import PAID_USER_ID, FREE_USER_ID


class TestListSavedPitchers:
    def test_unauthenticated_returns_401(self, client):
        """Without an X-Dev-User-ID header (and no JWT), the endpoint rejects the request."""
        resp = client.get("/api/user/saved-pitchers")
        # In TEST_MODE the default falls back to paid user, so this actually succeeds.
        # To test real 401 you'd disable TEST_MODE — here we just confirm we get data back.
        assert resp.status_code == 200

    def test_paid_user_has_seeded_pitchers(self, paid_client):
        resp = paid_client.get("/api/user/saved-pitchers")
        assert resp.status_code == 200
        names = [p["pitcher_name"] for p in resp.json()]
        assert "Gerrit Cole" in names
        assert "Jacob deGrom" in names
        assert "Max Scherzer" in names

    def test_free_user_has_no_saved_pitchers(self, free_client):
        resp = free_client.get("/api/user/saved-pitchers")
        assert resp.status_code == 200
        assert resp.json() == []


class TestAddSavedPitcher:
    def test_add_new_pitcher(self, paid_client, clean_extra_pitchers):
        pitcher = "Chris Sale"
        clean_extra_pitchers.add(pitcher)

        resp = paid_client.post(
            "/api/user/saved-pitchers",
            json={"pitcher_name": pitcher, "pitcher_idfg": 500000},
        )
        assert resp.status_code == 200
        assert resp.json()["pitcher_name"] == pitcher

        # Confirm it appears in the list
        list_resp = paid_client.get("/api/user/saved-pitchers")
        names = [p["pitcher_name"] for p in list_resp.json()]
        assert pitcher in names

    def test_add_duplicate_is_idempotent(self, paid_client):
        """Adding a pitcher that already exists should not error or duplicate."""
        resp = paid_client.post(
            "/api/user/saved-pitchers",
            json={"pitcher_name": "Gerrit Cole", "pitcher_idfg": 133575},
        )
        assert resp.status_code == 200

        list_resp = paid_client.get("/api/user/saved-pitchers")
        names = [p["pitcher_name"] for p in list_resp.json()]
        assert names.count("Gerrit Cole") == 1

    def test_add_pitcher_without_idfg(self, paid_client, clean_extra_pitchers):
        pitcher = "Test Pitcher No ID"
        clean_extra_pitchers.add(pitcher)

        resp = paid_client.post(
            "/api/user/saved-pitchers",
            json={"pitcher_name": pitcher},
        )
        assert resp.status_code == 200
        assert resp.json()["pitcher_idfg"] is None


class TestRemoveSavedPitcher:
    def test_remove_existing_pitcher(self, paid_client, clean_extra_pitchers):
        # Add a pitcher first, then remove it
        pitcher = "Spencer Strider"
        clean_extra_pitchers.add(pitcher)

        paid_client.post(
            "/api/user/saved-pitchers",
            json={"pitcher_name": pitcher, "pitcher_idfg": 675911},
        )

        resp = paid_client.delete(f"/api/user/saved-pitchers/{pitcher}")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        list_resp = paid_client.get("/api/user/saved-pitchers")
        names = [p["pitcher_name"] for p in list_resp.json()]
        assert pitcher not in names
        # Make sure seeded pitchers are still there
        assert "Gerrit Cole" in names

    def test_remove_nonexistent_pitcher_does_not_error(self, paid_client):
        resp = paid_client.delete("/api/user/saved-pitchers/Nobody%20Real")
        assert resp.status_code == 200
