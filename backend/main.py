"""FastAPI backend for Pitcher Trend Analyzer."""

from __future__ import annotations

import os
import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

import stripe
from fastapi import FastAPI, HTTPException, Depends, Request, Header
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import data as d
import compute as c
import db
import email_service
from auth import get_user_id
from scheduler import create_scheduler

logger = logging.getLogger(__name__)

TEST_MODE = os.getenv("TEST_MODE", "") == "1"
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "")
APP_URL = os.getenv("APP_URL", "http://localhost:5173")

# ── Lifespan: start/stop scheduler ───────────────────────────────────────────

_scheduler = create_scheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _scheduler.start()
    logger.info("APScheduler started — weekly emails fire Monday 9 AM ET")
    yield
    _scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


app = FastAPI(title="Pitcher Trend Analyzer API", version="2.0", lifespan=lifespan)

# ── Dev routes (only in TEST_MODE) ────────────────────────────────────────────
if TEST_MODE:
    from dev_routes import router as dev_router
    app.include_router(dev_router)
    logger.info("TEST_MODE: dev routes mounted at /dev/*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok", "test_mode": TEST_MODE}


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


class SavePitcherRequest(BaseModel):
    pitcher_name: str
    pitcher_idfg: Optional[int] = None


class NotificationSettingsRequest(BaseModel):
    enabled:            bool
    notification_email: Optional[str] = None


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


# ── Existing routes ────────────────────────────────────────────────────────────


@app.get("/api/pitchers")
async def get_pitchers():
    df = await run_in_threadpool(d.load_qualified_pitchers)
    return [
        {
            "name":    row["Name"],
            "idfg":   int(row["IDfg"]),
            "team":    row.get("Team", ""),
            "ip":      round(float(row["IP"]), 1),
            "g":       int(row["G"]),
            "gs":      int(row["GS"]),
            "gs_pct":  round(float(row["gs_pct"]) if row["gs_pct"] == row["gs_pct"] else 0, 3),
            "season":  int(row["_season"]),
        }
        for _, row in df.iterrows()
    ]


@app.get("/api/pitcher/{name}/id")
async def get_pitcher_id(name: str):
    pid = await run_in_threadpool(d.resolve_mlbam_id, name)
    if pid is None:
        raise HTTPException(status_code=404, detail=f"Could not resolve MLB ID for '{name}'")
    return {"name": name, "id": pid}


@app.get("/api/pitcher/{pid}/season/{year}/dates")
async def get_game_dates(pid: int, year: int):
    df = await _require_season(pid, year)
    counts = df.groupby("game_date")["pitch_type"].count()
    dates  = sorted(counts.index, reverse=True)
    return [
        {"date": str(d_), "pitches": int(counts[d_])}
        for d_ in dates
    ]


@app.get("/api/pitcher/{pid}/season/{year}/pitch-types")
async def get_pitch_types(pid: int, year: int):
    df = await _require_season(pid, year)
    pts = sorted(df["pitch_type"].dropna().unique())
    return [
        {"pitch_type": pt, "label": c._pt_label(pt)}
        for pt in pts
    ]


@app.get("/api/meta/metrics")
async def get_metrics():
    return [
        {"key": k, **v}
        for k, v in c.METRIC_CONFIG.items()
    ]


@app.get("/api/meta/seasons")
async def get_seasons():
    return d.AVAILABLE_SEASONS


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


# ── Saved Pitchers ────────────────────────────────────────────────────────────


@app.get("/api/user/saved-pitchers")
async def list_saved_pitchers(user_id: str = Depends(get_user_id)):
    pitchers = await run_in_threadpool(db.get_saved_pitchers, user_id)
    return pitchers


@app.post("/api/user/saved-pitchers")
async def save_pitcher(req: SavePitcherRequest, user_id: str = Depends(get_user_id)):
    result = await run_in_threadpool(
        db.add_saved_pitcher, user_id, req.pitcher_name, req.pitcher_idfg
    )
    return result


@app.delete("/api/user/saved-pitchers/{pitcher_name}")
async def delete_saved_pitcher(pitcher_name: str, user_id: str = Depends(get_user_id)):
    await run_in_threadpool(db.remove_saved_pitcher, user_id, pitcher_name)
    return {"ok": True}


# ── Subscription ──────────────────────────────────────────────────────────────


@app.get("/api/user/subscription")
async def get_subscription_status(user_id: str = Depends(get_user_id)):
    sub = await run_in_threadpool(db.get_subscription, user_id)
    return sub


@app.post("/api/user/subscription/checkout")
async def create_checkout_session(user_id: str = Depends(get_user_id)):
    """Create a Stripe Checkout Session for the $5/year plan."""
    if not stripe.api_key or stripe.api_key.startswith("sk_test_your"):
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    if not STRIPE_PRICE_ID or STRIPE_PRICE_ID.startswith("price_your"):
        raise HTTPException(status_code=503, detail="Stripe price ID not configured")

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
            success_url=f"{APP_URL}?checkout=success",
            cancel_url=f"{APP_URL}?checkout=cancel",
            client_reference_id=user_id,
            metadata={"user_id": user_id},
        )
        return {"checkout_url": session.url}
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/webhooks/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (checkout completed, subscription deleted)."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET.startswith("whsec_your"):
        raise HTTPException(status_code=503, detail="Stripe webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id") or session.get("client_reference_id")
        if user_id:
            await run_in_threadpool(
                db.upsert_subscription,
                user_id,
                {
                    "stripe_customer_id": session.get("customer"),
                    "stripe_subscription_id": session.get("subscription"),
                    "status": "active",
                },
            )

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.updated"):
        sub_obj = event["data"]["object"]
        customer_id = sub_obj.get("customer")
        # Look up user by stripe_customer_id
        if customer_id:
            status = sub_obj.get("status", "canceled")
            # map Stripe statuses to our simplified set
            our_status = "active" if status == "active" else "inactive"
            import datetime
            period_end = sub_obj.get("current_period_end")
            period_end_dt = (
                datetime.datetime.fromtimestamp(period_end, tz=datetime.timezone.utc).isoformat()
                if period_end
                else None
            )

            # Find the user by their stripe_customer_id
            try:
                import supabase as _sb_mod
                sb = _sb_mod.create_client(
                    os.getenv("SUPABASE_URL", ""),
                    os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
                )
                res = sb.table("subscriptions").select("user_id").eq("stripe_customer_id", customer_id).execute()
                if res.data:
                    uid = res.data[0]["user_id"]
                    await run_in_threadpool(
                        db.upsert_subscription,
                        uid,
                        {
                            "stripe_customer_id": customer_id,
                            "stripe_subscription_id": sub_obj.get("id"),
                            "status": our_status,
                            "current_period_end": period_end_dt,
                        },
                    )
            except Exception as exc:
                logger.error("Webhook subscription update failed: %s", exc)

    return {"received": True}


# ── Notification Settings ─────────────────────────────────────────────────────


@app.get("/api/user/notifications")
async def get_notifications(user_id: str = Depends(get_user_id)):
    settings = await run_in_threadpool(db.get_notification_settings, user_id)
    return settings


@app.put("/api/user/notifications")
async def update_notifications(
    req: NotificationSettingsRequest,
    user_id: str = Depends(get_user_id),
):
    # Only allow paying users to enable notifications
    if req.enabled:
        is_paid = await run_in_threadpool(db.is_active_subscriber, user_id)
        if not is_paid:
            raise HTTPException(
                status_code=402,
                detail="Weekly notifications require an active subscription ($5/year)",
            )
    await run_in_threadpool(
        db.upsert_notification_settings, user_id, req.enabled, req.notification_email
    )
    return {"ok": True}


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
