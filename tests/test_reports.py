"""
Tests for the analysis report endpoints.

Data fetching (pybaseball) is mocked so tests run fast without network calls.
The mocks return minimal but structurally correct DataFrames that let the
compute layer run through successfully.
"""

import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch
from datetime import date


# ── Sample DataFrame factory ──────────────────────────────────────────────────

def _make_season_df(n_games: int = 5, pitches_per_game: int = 20) -> pd.DataFrame:
    """Create a minimal Statcast-like DataFrame for tests."""
    rng = np.random.default_rng(42)
    records = []
    base_date = date(2024, 4, 1)

    for g in range(n_games):
        game_date = pd.Timestamp(base_date.replace(day=base_date.day + g * 5))
        for _ in range(pitches_per_game):
            records.append({
                "game_date":         game_date,
                "pitch_type":        rng.choice(["FF", "SI", "CU"]),
                "release_speed":     float(rng.uniform(88, 98)),
                "release_spin_rate": float(rng.uniform(2100, 2500)),
                "pfx_x":             float(rng.uniform(-1.0, 1.0)),
                "pfx_z":             float(rng.uniform(0.3, 1.5)),
                "release_extension": float(rng.uniform(5.5, 7.0)),
                "batter":            int(rng.integers(500000, 700000)),
                "events":            rng.choice(["strikeout", "single", None], p=[0.3, 0.2, 0.5]),
                "description":       rng.choice(["swinging_strike", "called_strike", "ball", "hit_into_play"]),
                "launch_speed":      float(rng.uniform(70, 105)) if rng.random() > 0.4 else None,
                "bb_type":           rng.choice(["ground_ball", "fly_ball", "line_drive", None], p=[0.3, 0.2, 0.2, 0.3]),
                "zone":              int(rng.integers(1, 14)),
            })

    df = pd.DataFrame(records)
    df["game_date"] = pd.to_datetime(df["game_date"]).dt.date
    return df


SAMPLE_DF = _make_season_df()
TARGET_DATE = str(SAMPLE_DF["game_date"].iloc[0])
PITCHER_ID = 543037  # fake MLBAM ID for test


# ── Pitch Metrics ─────────────────────────────────────────────────────────────

class TestPitchMetricsEndpoint:
    @patch("main.d.load_season", return_value=SAMPLE_DF)
    @patch("main.d.build_trend_df", return_value=SAMPLE_DF)
    def test_returns_expected_keys(self, mock_trend, mock_season, paid_client):
        resp = paid_client.post("/api/analysis/pitch-metrics", json={
            "pitcher_id":  PITCHER_ID,
            "season":      2024,
            "target_date": TARGET_DATE,
            "trend_type":  "full_season",
            "n_days":      30,
            "trend_season": 2024,
            "pitch_types": ["FF", "SI"],
            "metrics":     ["release_speed"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "kpi" in data
        assert "comparison" in data
        assert "time_series" in data
        assert "pitch_usage_today" in data
        assert "pitch_usage_trend" in data

    @patch("main.d.load_season", return_value=SAMPLE_DF)
    @patch("main.d.build_trend_df", return_value=SAMPLE_DF)
    def test_kpi_fields_present(self, mock_trend, mock_season, paid_client):
        resp = paid_client.post("/api/analysis/pitch-metrics", json={
            "pitcher_id":   PITCHER_ID,
            "season":       2024,
            "target_date":  TARGET_DATE,
            "trend_type":   "full_season",
            "n_days":       30,
            "trend_season": 2024,
            "pitch_types":  ["FF"],
            "metrics":      ["release_speed"],
        })
        kpi = resp.json()["kpi"]
        for key in ("pitches_today", "pitches_trend", "pitch_types", "batters_faced"):
            assert key in kpi

    @patch("main.d.load_season", return_value=pd.DataFrame())
    def test_empty_season_returns_404(self, mock_season, paid_client):
        resp = paid_client.post("/api/analysis/pitch-metrics", json={
            "pitcher_id":   PITCHER_ID,
            "season":       2020,
            "target_date":  "2020-04-01",
            "trend_type":   "full_season",
            "n_days":       30,
            "trend_season": 2020,
            "pitch_types":  ["FF"],
            "metrics":      ["release_speed"],
        })
        assert resp.status_code == 404

    def test_invalid_date_returns_422(self, paid_client):
        resp = paid_client.post("/api/analysis/pitch-metrics", json={
            "pitcher_id":   PITCHER_ID,
            "season":       2024,
            "target_date":  "not-a-date",
            "trend_type":   "full_season",
            "n_days":       30,
            "trend_season": 2024,
            "pitch_types":  ["FF"],
            "metrics":      ["release_speed"],
        })
        assert resp.status_code in (422, 404)


# ── Outcome Stats ─────────────────────────────────────────────────────────────

class TestOutcomeEndpoint:
    @patch("main.d.load_season", return_value=SAMPLE_DF)
    @patch("main.d.build_trend_df", return_value=SAMPLE_DF)
    def test_returns_expected_keys(self, mock_trend, mock_season, paid_client):
        resp = paid_client.post("/api/analysis/outcomes", json={
            "pitcher_id":   PITCHER_ID,
            "season":       2024,
            "target_date":  TARGET_DATE,
            "trend_type":   "full_season",
            "n_days":       30,
            "trend_season": 2024,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "day_outcomes" in data
        assert "trend_outcomes" in data
        assert "per_game_outcomes" in data

    @patch("main.d.load_season", return_value=SAMPLE_DF)
    @patch("main.d.build_trend_df", return_value=pd.DataFrame())
    def test_empty_trend_returns_nulls(self, mock_trend, mock_season, paid_client):
        resp = paid_client.post("/api/analysis/outcomes", json={
            "pitcher_id":   PITCHER_ID,
            "season":       2024,
            "target_date":  TARGET_DATE,
            "trend_type":   "rolling",
            "n_days":       5,
            "trend_season": 2024,
        })
        assert resp.status_code == 200
        trend = resp.json()["trend_outcomes"]
        assert all(v is None for v in trend.values())


# ── Regression Features ───────────────────────────────────────────────────────

class TestRegressionFeatures:
    @patch("main.d.load_season", return_value=SAMPLE_DF)
    def test_returns_feature_list(self, mock_season, paid_client):
        resp = paid_client.post("/api/regression/features", json={
            "pitcher_id": PITCHER_ID,
            "season":     2024,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "features" in data
        assert len(data["features"]) > 0
        assert all("col" in f and "label" in f for f in data["features"])


# ── Meta endpoints ────────────────────────────────────────────────────────────

class TestMetaEndpoints:
    def test_get_seasons(self, client):
        resp = client.get("/api/meta/seasons")
        assert resp.status_code == 200
        seasons = resp.json()
        assert isinstance(seasons, list)
        assert len(seasons) > 0
        assert all(isinstance(s, int) for s in seasons)

    def test_get_metrics(self, client):
        resp = client.get("/api/meta/metrics")
        assert resp.status_code == 200
        metrics = resp.json()
        assert isinstance(metrics, list)
        assert len(metrics) > 0
        assert all("key" in m and "label" in m for m in metrics)

    def test_health_endpoint(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["test_mode"] is True
