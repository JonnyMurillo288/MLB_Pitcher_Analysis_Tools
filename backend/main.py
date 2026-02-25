"""FastAPI backend for Pitcher Trend Analyzer."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import data as d
import compute as c

app = FastAPI(title="Pitcher Trend Analyzer API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic request models ───────────────────────────────────────────────────

class PitchMetricsRequest(BaseModel):
    pitcher_id:   int
    season:       int
    target_date:  str
    trend_type:   str            # "rolling" | "full_season"
    n_days:       int | None = 30
    trend_season: int | None = None
    pitch_types:  list[str]
    metrics:      list[str]

class OutcomeRequest(BaseModel):
    pitcher_id:   int
    season:       int
    target_date:  str
    trend_type:   str
    n_days:       int | None = 30
    trend_season: int | None = None

class RegressionFeaturesRequest(BaseModel):
    pitcher_id: int
    season:     int

class LagConfig(BaseModel):
    type: str   # "None" | "Point lag" | "Rolling mean"
    n:    int = 1

class RegressionRunRequest(BaseModel):
    pitcher_id: int
    season:     int
    y_col:      str
    x_cols:     list[str]
    lag_config: dict[str, LagConfig]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid date: {s}")


async def _require_season(pid: int, season: int):
    df = await run_in_threadpool(d.load_season, pid, season)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for pitcher {pid} in {season}")
    return df


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/pitchers")
async def get_pitchers():
    df = await run_in_threadpool(d.load_qualified_pitchers)
    return {
        "pitchers": [
            {
                "name":    row["Name"],
                "team":    row.get("Team", ""),
                "ip":      round(float(row["IP"]), 1),
                "g":       int(row["G"]),
                "gs":      int(row["GS"]),
                "gs_pct":  round(float(row["gs_pct"]) if row["gs_pct"] == row["gs_pct"] else 0, 3),
                "season":  int(row["_season"]),
            }
            for _, row in df.iterrows()
        ]
    }


@app.get("/api/pitcher/{name}/id")
async def get_pitcher_id(name: str):
    pid = await run_in_threadpool(d.resolve_mlbam_id, name)
    if pid is None:
        raise HTTPException(status_code=404, detail=f"Could not resolve MLB ID for '{name}'")
    return {"name": name, "mlbam_id": pid}


@app.get("/api/pitcher/{pid}/season/{year}/dates")
async def get_game_dates(pid: int, year: int):
    df = await _require_season(pid, year)
    counts = df.groupby("game_date")["pitch_type"].count()
    dates  = sorted(counts.index, reverse=True)
    return {
        "dates": [
            {"date": str(d_), "pitch_count": int(counts[d_])}
            for d_ in dates
        ]
    }


@app.get("/api/pitcher/{pid}/season/{year}/pitch-types")
async def get_pitch_types(pid: int, year: int):
    df = await _require_season(pid, year)
    pts = sorted(df["pitch_type"].dropna().unique())
    return {
        "pitch_types": [
            {"code": pt, "label": c._pt_label(pt)}
            for pt in pts
        ]
    }


@app.get("/api/meta/metrics")
async def get_metrics():
    return {
        "metrics": [
            {"key": k, **v}
            for k, v in c.METRIC_CONFIG.items()
        ]
    }


@app.get("/api/meta/seasons")
async def get_seasons():
    return {"seasons": d.AVAILABLE_SEASONS}


# ── Analysis endpoints ────────────────────────────────────────────────────────

@app.post("/api/analysis/pitch-metrics")
async def pitch_metrics_analysis(req: PitchMetricsRequest):
    target_date = _parse_date(req.target_date)
    season_df   = await _require_season(req.pitcher_id, req.season)
    trend_df    = await run_in_threadpool(
        d.build_trend_df, season_df, target_date,
        req.trend_type, req.n_days, req.trend_season, req.pitcher_id,
    )

    day_df   = season_df[season_df["game_date"] == target_date]
    day_filt = day_df[day_df["pitch_type"].isin(req.pitch_types)]
    t_filt   = trend_df[trend_df["pitch_type"].isin(req.pitch_types)] if not trend_df.empty else trend_df

    return {
        "kpi": {
            "pitches_today":  len(day_filt),
            "pitches_trend":  len(t_filt),
            "pitch_types":    int(day_filt["pitch_type"].nunique()),
            "batters_faced":  int(day_df["batter"].nunique()) if "batter" in day_df.columns else 0,
        },
        "comparison":       c.compute_comparison(day_filt, t_filt, req.metrics, req.pitch_types),
        "time_series":      c.pitch_time_series(season_df, req.metrics, req.pitch_types),
        "pitch_usage_today": c.pitch_usage(day_filt),
        "pitch_usage_trend": c.pitch_usage(t_filt),
    }


@app.post("/api/analysis/outcomes")
async def outcome_analysis(req: OutcomeRequest):
    target_date = _parse_date(req.target_date)
    season_df   = await _require_season(req.pitcher_id, req.season)
    trend_df    = await run_in_threadpool(
        d.build_trend_df, season_df, target_date,
        req.trend_type, req.n_days, req.trend_season, req.pitcher_id,
    )

    day_df = season_df[season_df["game_date"] == target_date]

    return {
        "day_outcomes":     c.outcome_agg(day_df),
        "trend_outcomes":   c.outcome_agg(trend_df) if not trend_df.empty else {k: None for k in c.OUTCOME_CONFIG},
        "per_game_outcomes": c.outcome_by_game(season_df),
        "pitch_usage_today": c.pitch_usage(day_df),
        "pitch_usage_trend": c.pitch_usage(trend_df) if not trend_df.empty else [],
        "outcome_config":   {k: {"label": v["label"], "higher_is_better": v["higher_is_better"], "fmt": v["fmt"]}
                             for k, v in c.OUTCOME_CONFIG.items()},
    }


@app.post("/api/regression/features")
async def regression_features(req: RegressionFeaturesRequest):
    season_df = await _require_season(req.pitcher_id, req.season)
    _, label_map = await run_in_threadpool(c.build_regression_features, season_df)
    return {
        "features": [
            {"col": col, "label": label}
            for col, label in label_map.items()
        ]
    }


@app.post("/api/regression/run")
async def regression_run(req: RegressionRunRequest):
    season_df = await _require_season(req.pitcher_id, req.season)
    reg_df, _ = await run_in_threadpool(c.build_regression_features, season_df)
    lag_cfg   = {col: {"type": lc.type, "n": lc.n} for col, lc in req.lag_config.items()}

    try:
        result = await run_in_threadpool(c.run_ols, reg_df, req.y_col, req.x_cols, lag_cfg)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regression failed: {e}")

    return result


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
