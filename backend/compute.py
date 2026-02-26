"""Pure computation functions — no I/O, no cache, fully serialisable outputs."""

from __future__ import annotations

import numpy as np
import pandas as pd
from datetime import date
from typing import Any

# ── Constants (mirrors Streamlit file) ────────────────────────────────────────

METRIC_CONFIG: dict[str, dict] = {
    "release_speed":     {"label": "Velocity",           "unit": "mph", "higher_is_better": True,  "fmt": ".1f"},
    "release_spin_rate": {"label": "Spin Rate",          "unit": "rpm", "higher_is_better": True,  "fmt": ".0f"},
    "pfx_x":             {"label": "Horizontal Break",   "unit": "in",  "higher_is_better": None,  "fmt": ".2f"},
    "pfx_z":             {"label": "Vertical Break",     "unit": "in",  "higher_is_better": None,  "fmt": ".2f"},
    "release_extension": {"label": "Extension",          "unit": "ft",  "higher_is_better": True,  "fmt": ".2f"},
    "release_pos_x":     {"label": "Release Point X",   "unit": "ft",  "higher_is_better": None,  "fmt": ".2f"},
    "release_pos_z":     {"label": "Release Point Z",   "unit": "ft",  "higher_is_better": None,  "fmt": ".2f"},
    "effective_speed":   {"label": "Effective Velocity", "unit": "mph", "higher_is_better": True,  "fmt": ".1f"},
}

OUTCOME_CONFIG: dict[str, dict] = {
    "exit_velo":              {"label": "Exit Velocity (mph)",  "higher_is_better": False, "fmt": ".1f"},
    "gb_pct":                 {"label": "GB%",                  "higher_is_better": True,  "fmt": ".1f"},
    "fb_pct":                 {"label": "FB%",                  "higher_is_better": False, "fmt": ".1f"},
    "bb_per_9":               {"label": "BB/9",                 "higher_is_better": False, "fmt": ".2f"},
    "k_per_9":                {"label": "K/9",                  "higher_is_better": True,  "fmt": ".2f"},
    "whiff_pct":              {"label": "Whiff%",               "higher_is_better": True,  "fmt": ".1f"},
    "swstr_pct":              {"label": "SwStr%",               "higher_is_better": True,  "fmt": ".1f"},
    "chase_pct":              {"label": "Chase%",               "higher_is_better": True,  "fmt": ".1f"},
    "hhr_pct":                {"label": "Hard Hit%",            "higher_is_better": False, "fmt": ".1f"},
    "barrel_pct":             {"label": "Barrel%",              "higher_is_better": False, "fmt": ".1f"},
    "fps_pct":                {"label": "F-Strike%",            "higher_is_better": True,  "fmt": ".1f"},
    "zone_pct":               {"label": "Zone%",                "higher_is_better": None,  "fmt": ".1f"},
    "iz_whiff_pct":           {"label": "In-Zone Whiff%",       "higher_is_better": True,  "fmt": ".1f"},
    "oz_whiff_pct":           {"label": "O-Zone Whiff%",        "higher_is_better": True,  "fmt": ".1f"},
    "two_strike_whiff_pct":   {"label": "2-Strike Whiff%",      "higher_is_better": True,  "fmt": ".1f"},
    "rp_consistency":         {"label": "Release Spread (ft)",  "higher_is_better": False, "fmt": ".3f"},
}

PITCH_TYPE_LABELS: dict[str, str] = {
    "FF": "4-Seam FB", "SI": "Sinker",  "FC": "Cutter",      "SL": "Slider",
    "CU": "Curveball", "KC": "Kn. Curve","CH": "Changeup",   "FS": "Splitter",
    "ST": "Sweeper",   "SV": "Slurve",  "KN": "Knuckleball", "EP": "Eephus",
    "SC": "Screwball", "FO": "Forkball","PO": "Pitchout",    "CS": "Slow Curve",
}

_METRIC_SHORT: dict[str, str] = {
    "release_speed":     "velo",
    "release_spin_rate": "spin",
    "pfx_x":             "break_h",
    "pfx_z":             "break_v",
    "release_extension": "ext",
    "release_pos_x":     "rel_x",
    "release_pos_z":     "rel_z",
    "effective_speed":   "eff_velo",
}

_SWSTR_DESC = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}
_SWING_DESC = _SWSTR_DESC | {
    "foul", "foul_bunt", "foul_pitchout",
    "hit_into_play", "hit_into_play_no_out",
    "hit_into_play_score",
}
_FPS_DESC = {
    "called_strike", "swinging_strike", "swinging_strike_blocked",
    "foul_tip", "foul", "foul_bunt", "foul_pitchout",
}
_OUT_EVENTS_1 = {
    "strikeout", "field_out", "fielders_choice_out", "force_out",
    "sac_fly", "sac_bunt",
}
_OUT_EVENTS_2 = {
    "grounded_into_double_play", "strikeout_double_play",
    "sac_fly_double_play", "sac_bunt_double_play", "double_play",
}
_OUT_EVENTS_3 = {"triple_play"}

AVAILABLE_SEASONS = [2021, 2022, 2023, 2024, 2025]


def _pt_label(pt: str) -> str:
    return PITCH_TYPE_LABELS.get(str(pt), str(pt))


def _safe(v: Any) -> Any:
    """Convert NaN / numpy scalar to JSON-safe Python type."""
    if v is None:
        return None
    try:
        if np.isnan(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    return v


# ── Pitch metric comparison ───────────────────────────────────────────────────

def compute_comparison(
    day_df: pd.DataFrame,
    trend_df: pd.DataFrame,
    metrics: list[str],
    pitch_types: list[str],
) -> list[dict]:
    rows = []
    for pt in pitch_types:
        d_sub = day_df[day_df["pitch_type"] == pt]
        t_sub = trend_df[trend_df["pitch_type"] == pt] if not trend_df.empty else pd.DataFrame()

        if d_sub.empty:
            continue

        for metric in metrics:
            if metric not in day_df.columns:
                continue
            d_val = d_sub[metric].dropna().mean()
            t_val = t_sub[metric].dropna().mean() if not t_sub.empty else float("nan")

            if pd.isna(d_val):
                continue

            delta     = d_val - t_val if not pd.isna(t_val) else float("nan")
            delta_pct = (delta / abs(t_val) * 100) if (not pd.isna(t_val) and t_val != 0) else float("nan")
            cfg       = METRIC_CONFIG.get(metric, {})

            rows.append({
                "pitch_type":        pt,
                "pitch_label":       _pt_label(pt),
                "metric":            metric,
                "metric_label":      cfg.get("label", metric),
                "unit":              cfg.get("unit", ""),
                "today":             _safe(d_val),
                "trend_avg":         _safe(t_val),
                "delta":             _safe(delta),
                "delta_pct":         _safe(delta_pct),
                "n_today":           int(d_sub[metric].dropna().count()),
                "n_trend":           int(t_sub[metric].dropna().count()) if not t_sub.empty else 0,
                "fmt":               cfg.get("fmt", ".2f"),
                "higher_is_better":  cfg.get("higher_is_better"),
            })
    return rows


def pitch_usage(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    vc = df["pitch_type"].value_counts()
    return [{"pitch_type": k, "label": _pt_label(k), "count": int(v)} for k, v in vc.items()]


def pitch_time_series(
    season_df: pd.DataFrame,
    metrics: list[str],
    pitch_types: list[str],
) -> dict[str, list[dict]]:
    """Per-game, per-pitch-type averages for each metric."""
    result: dict[str, list[dict]] = {}
    plot_df = season_df[season_df["pitch_type"].isin(pitch_types)].copy()

    for metric in metrics:
        if metric not in plot_df.columns:
            continue
        daily = (
            plot_df.groupby(["game_date", "pitch_type"])[metric]
            .mean()
            .reset_index()
            .rename(columns={metric: "value"})
        )
        daily = daily.dropna(subset=["value"])
        daily["game_date"] = daily["game_date"].astype(str)
        daily["pitch_label"] = daily["pitch_type"].map(_pt_label)
        result[metric] = [
            {
                "game_date":   row["game_date"],
                "pitch_type":  row["pitch_type"],
                "pitch_label": row["pitch_label"],
                "value":       _safe(row["value"]),
            }
            for _, row in daily.iterrows()
        ]
    return result


# ── Outcome stats ─────────────────────────────────────────────────────────────

def outcome_agg(df: pd.DataFrame) -> dict[str, Any]:
    if df.empty:
        return {k: None for k in OUTCOME_CONFIG}

    n_pitches  = len(df)
    n_swstr    = df["description"].isin(_SWSTR_DESC).sum()
    n_swings   = df["description"].isin(_SWING_DESC).sum()
    in_zone    = df["zone"].between(1, 9, inclusive="both")
    out_zone   = ~in_zone & df["zone"].notna()
    n_out_zone = out_zone.sum()
    n_chase    = df.loc[out_zone, "description"].isin(_SWING_DESC).sum()
    exit_velo  = df.loc[df["launch_speed"].notna(), "launch_speed"].mean()
    total_bip  = df["bb_type"].notna().sum()
    gb_pct     = (df["bb_type"] == "ground_ball").sum() / total_bip * 100 if total_bip else float("nan")
    fb_pct     = (df["bb_type"] == "fly_ball").sum()    / total_bip * 100 if total_bip else float("nan")
    pa_df      = df[df["events"].notna()]
    tbf        = len(pa_df)
    walks      = pa_df["events"].isin(["walk", "intent_walk"]).sum()
    ks         = pa_df["events"].isin(["strikeout", "strikeout_double_play"]).sum()

    # Hard-hit rate: balls in play hit ≥95 mph
    bip_speed  = df.loc[df["launch_speed"].notna(), "launch_speed"]
    n_bip      = len(bip_speed)
    hhr_pct    = (bip_speed >= 95).sum() / n_bip * 100 if n_bip else float("nan")

    # Barrel rate per TBF
    if "launch_speed_angle" in df.columns:
        barrel_count = (df["launch_speed_angle"].fillna("").str.lower() == "barrel").sum()
    elif "launch_angle" in df.columns:
        barrel_count = ((df["launch_speed"] >= 98) & df["launch_angle"].between(26, 30)).sum()
    else:
        barrel_count = 0
    barrel_pct = barrel_count / tbf * 100 if tbf else float("nan")

    # First-pitch strike %
    fp_mask = (df["balls"] == 0) & (df["strikes"] == 0)
    n_fp    = fp_mask.sum()
    fps_pct = df.loc[fp_mask, "description"].isin(_FPS_DESC).sum() / n_fp * 100 if n_fp else float("nan")

    # Zone %
    zone_pct = in_zone.sum() / n_pitches * 100 if n_pitches else float("nan")

    # In-zone whiff%
    iz_swings  = df.loc[in_zone, "description"].isin(_SWING_DESC).sum()
    iz_swstr   = df.loc[in_zone, "description"].isin(_SWSTR_DESC).sum()
    iz_whiff   = iz_swstr / iz_swings * 100 if iz_swings else float("nan")

    # Out-of-zone whiff%
    oz_swings  = df.loc[out_zone, "description"].isin(_SWING_DESC).sum()
    oz_swstr   = df.loc[out_zone, "description"].isin(_SWSTR_DESC).sum()
    oz_whiff   = oz_swstr / oz_swings * 100 if oz_swings else float("nan")

    # 2-strike whiff%
    two_k      = df["strikes"] == 2
    ts_swings  = df.loc[two_k, "description"].isin(_SWING_DESC).sum()
    ts_swstr   = df.loc[two_k, "description"].isin(_SWSTR_DESC).sum()
    ts_whiff   = ts_swstr / ts_swings * 100 if ts_swings else float("nan")

    # Release point consistency (avg std dev of x and z release positions)
    rp_std_x = df["release_pos_x"].std() if "release_pos_x" in df.columns else float("nan")
    rp_std_z = df["release_pos_z"].std() if "release_pos_z" in df.columns else float("nan")
    rp_cons  = (rp_std_x + rp_std_z) / 2 if not (pd.isna(rp_std_x) or pd.isna(rp_std_z)) else float("nan")

    return {
        "exit_velo":              _safe(exit_velo),
        "gb_pct":                 _safe(gb_pct),
        "fb_pct":                 _safe(fb_pct),
        "bb_per_9":               _safe(walks / tbf * 27 if tbf else float("nan")),
        "k_per_9":                _safe(ks    / tbf * 27 if tbf else float("nan")),
        "whiff_pct":              _safe(n_swstr / n_swings  * 100 if n_swings  else float("nan")),
        "swstr_pct":              _safe(n_swstr / n_pitches * 100 if n_pitches else float("nan")),
        "chase_pct":              _safe(n_chase / n_out_zone * 100 if n_out_zone else float("nan")),
        "hhr_pct":                _safe(hhr_pct),
        "barrel_pct":             _safe(barrel_pct),
        "fps_pct":                _safe(fps_pct),
        "zone_pct":               _safe(zone_pct),
        "iz_whiff_pct":           _safe(iz_whiff),
        "oz_whiff_pct":           _safe(oz_whiff),
        "two_strike_whiff_pct":   _safe(ts_whiff),
        "rp_consistency":         _safe(rp_cons),
    }


def outcome_by_game(df: pd.DataFrame) -> list[dict]:
    records = []
    for gd, gdf in df.groupby("game_date"):
        row = outcome_agg(gdf)
        row["game_date"] = str(gd)
        records.append(row)
    return records


# ── Trend signals ─────────────────────────────────────────────────────────────

_SIGNAL_HIGHER: dict[str, bool | None] = {
    "release_speed": True,
    "k_per_9":       True,
    "bb_per_9":      False,
    "whiff_pct":     True,
    "exit_velo":     False,
}


def compute_signals(season_df: pd.DataFrame, n_days: int) -> dict:
    """
    Compute automated trend signals comparing the rolling window to the season baseline.
    Returns z-score arrows, breakout, divergence, and pitch-mix-shift flags.
    """
    empty: dict = {
        "arrows": {}, "breakout": False, "divergence": False,
        "pitch_mix_shift": False, "shifted_pitches": [],
    }
    if season_df.empty:
        return empty

    df = season_df.copy()
    df["_gd_str"]  = df["game_date"].astype(str)
    df["_date_dt"] = pd.to_datetime(df["game_date"])
    last_date      = df["_date_dt"].max()
    cutoff         = last_date - pd.Timedelta(days=n_days)
    rolling_df     = df[df["_date_dt"] > cutoff].copy()

    roll_dates = set(rolling_df["_gd_str"].unique())
    if len(roll_dates) < 3:
        return empty

    # Per-game velocity
    velo_pg = (
        df.groupby("_gd_str")["release_speed"].mean().dropna()
        if "release_speed" in df.columns
        else pd.Series(dtype=float)
    )

    # Per-game outcome stats
    all_out = outcome_by_game(df)
    out_pg  = {r["game_date"]: r for r in all_out}

    def _signal(per_game: pd.Series) -> str | None:
        if len(per_game) < 5:
            return None
        roll_vals = per_game[per_game.index.isin(roll_dates)]
        if len(roll_vals) < 2:
            return None
        s_mean = float(per_game.mean())
        s_std  = float(per_game.std())
        r_mean = float(roll_vals.mean())
        if pd.isna(s_std) or s_std < 1e-6:
            return None
        z = (r_mean - s_mean) / s_std
        if z > 1.0:
            return "up"
        if z < -1.0:
            return "down"
        return None

    arrows: dict[str, str] = {}

    sig = _signal(velo_pg)
    if sig:
        arrows["release_speed"] = sig

    for stat_key in ["k_per_9", "bb_per_9", "whiff_pct", "exit_velo"]:
        vals = {
            gd: r[stat_key]
            for gd, r in out_pg.items()
            if r.get(stat_key) is not None
        }
        if vals:
            per_game = pd.Series(vals, dtype=float)
            sig = _signal(per_game)
            if sig:
                arrows[stat_key] = sig

    # Breakout: velocity ↑ AND whiff% ↑ AND K/9 ↑
    breakout = (
        arrows.get("release_speed") == "up"
        and arrows.get("whiff_pct") == "up"
        and arrows.get("k_per_9") == "up"
    )

    # Divergence: velocity ↓ AND walk rate ↑
    divergence = (
        arrows.get("release_speed") == "down"
        and arrows.get("bb_per_9") == "up"
    )

    # Pitch mix shift: any pitch type usage changed >10pp in rolling window
    shifted: list[str] = []
    if "pitch_type" in df.columns and not rolling_df.empty:
        s_usage = (df["pitch_type"].value_counts(normalize=True) * 100).to_dict()
        r_usage = (rolling_df["pitch_type"].value_counts(normalize=True) * 100).to_dict()
        for pt in set(list(s_usage) + list(r_usage)):
            if abs(r_usage.get(pt, 0) - s_usage.get(pt, 0)) > 10:
                shifted.append(str(pt))

    return {
        "arrows":         arrows,
        "breakout":       bool(breakout),
        "divergence":     bool(divergence),
        "pitch_mix_shift": bool(shifted),
        "shifted_pitches": shifted,
    }


# ── Game log ──────────────────────────────────────────────────────────────────

def game_log(season_df: pd.DataFrame) -> list[dict]:
    """Per-game aggregated stats for the game log table."""
    if season_df.empty:
        return []

    records = []
    for gd, gdf in season_df.groupby("game_date"):
        pa_df = gdf[gdf["events"].notna()]
        tbf   = len(pa_df)
        ks    = int(pa_df["events"].isin(["strikeout", "strikeout_double_play"]).sum())
        bbs   = int(pa_df["events"].isin(["walk", "intent_walk"]).sum())
        hrs   = int(pa_df["events"].isin(["home_run"]).sum())

        outs = (
            int(pa_df["events"].isin(_OUT_EVENTS_1).sum())
            + int(pa_df["events"].isin(_OUT_EVENTS_2).sum()) * 2
            + int(pa_df["events"].isin(_OUT_EVENTS_3).sum()) * 3
        )
        ip = round(outs / 3, 1) if outs > 0 else None

        velo      = gdf["release_speed"].dropna().mean()
        n_swstr   = gdf["description"].isin(_SWSTR_DESC).sum()
        n_swings  = gdf["description"].isin(_SWING_DESC).sum()
        whiff_pct = n_swstr / n_swings * 100 if n_swings else float("nan")
        exit_velo = (
            gdf.loc[gdf["launch_speed"].notna(), "launch_speed"].mean()
            if "launch_speed" in gdf.columns else float("nan")
        )

        records.append({
            "game_date": str(gd),
            "tbf":       tbf,
            "ip":        _safe(ip) if ip is not None else None,
            "k":         ks,
            "bb":        bbs,
            "hr":        hrs,
            "velo":      _safe(velo),
            "whiff_pct": _safe(whiff_pct),
            "exit_velo": _safe(exit_velo),
        })

    return sorted(records, key=lambda r: r["game_date"])


# ── Table View ────────────────────────────────────────────────────────────────

TABLE_STAT_CATALOG: dict[str, dict] = {
    # Pitch Arsenal
    "release_speed":     {"label": "Velocity",           "unit": "mph", "group": "Pitch Arsenal", "higher_is_better": True,  "compute": "mean"},
    "effective_speed":   {"label": "Effective Velocity", "unit": "mph", "group": "Pitch Arsenal", "higher_is_better": True,  "compute": "mean"},
    "release_spin_rate": {"label": "Spin Rate",          "unit": "rpm", "group": "Pitch Arsenal", "higher_is_better": True,  "compute": "mean"},
    "spin_axis":         {"label": "Spin Axis",          "unit": "°",   "group": "Pitch Arsenal", "higher_is_better": None,  "compute": "mean"},
    "pfx_x":             {"label": "Horizontal Break",   "unit": "in",  "group": "Pitch Arsenal", "higher_is_better": None,  "compute": "mean"},
    "pfx_z":             {"label": "Vertical Break",     "unit": "in",  "group": "Pitch Arsenal", "higher_is_better": None,  "compute": "mean"},
    # Mechanics
    "release_extension":    {"label": "Extension",          "unit": "ft",  "group": "Mechanics", "higher_is_better": True,  "compute": "mean"},
    "release_pos_x":        {"label": "Release Point X",   "unit": "ft",  "group": "Mechanics", "higher_is_better": None,  "compute": "mean"},
    "release_pos_z":        {"label": "Release Point Z",   "unit": "ft",  "group": "Mechanics", "higher_is_better": None,  "compute": "mean"},
    "rp_consistency":       {"label": "Release Spread",    "unit": "ft",  "group": "Mechanics", "higher_is_better": False, "compute": "outcome"},
    # Control
    "plate_x":              {"label": "Plate X",            "unit": "ft",  "group": "Control",  "higher_is_better": None,  "compute": "mean"},
    "plate_z":              {"label": "Plate Z",            "unit": "ft",  "group": "Control",  "higher_is_better": None,  "compute": "mean"},
    "fps_pct":              {"label": "F-Strike%",          "unit": "%",   "group": "Control",  "higher_is_better": True,  "compute": "outcome"},
    "zone_pct":             {"label": "Zone%",              "unit": "%",   "group": "Control",  "higher_is_better": None,  "compute": "outcome"},
    # Results
    "exit_velo":            {"label": "Exit Velocity",      "unit": "mph", "group": "Results",  "higher_is_better": False, "compute": "outcome"},
    "hhr_pct":              {"label": "Hard Hit%",          "unit": "%",   "group": "Results",  "higher_is_better": False, "compute": "outcome"},
    "barrel_pct":           {"label": "Barrel%",            "unit": "%",   "group": "Results",  "higher_is_better": False, "compute": "outcome"},
    "gb_pct":               {"label": "GB%",                "unit": "%",   "group": "Results",  "higher_is_better": True,  "compute": "outcome"},
    "fb_pct":               {"label": "FB%",                "unit": "%",   "group": "Results",  "higher_is_better": False, "compute": "outcome"},
    "bb_per_9":             {"label": "BB/9",               "unit": "",    "group": "Results",  "higher_is_better": False, "compute": "outcome"},
    "k_per_9":              {"label": "K/9",                "unit": "",    "group": "Results",  "higher_is_better": True,  "compute": "outcome"},
    "whiff_pct":            {"label": "Whiff%",             "unit": "%",   "group": "Results",  "higher_is_better": True,  "compute": "outcome"},
    "iz_whiff_pct":         {"label": "In-Zone Whiff%",     "unit": "%",   "group": "Results",  "higher_is_better": True,  "compute": "outcome"},
    "oz_whiff_pct":         {"label": "O-Zone Whiff%",      "unit": "%",   "group": "Results",  "higher_is_better": True,  "compute": "outcome"},
    "two_strike_whiff_pct": {"label": "2-Strike Whiff%",    "unit": "%",   "group": "Results",  "higher_is_better": True,  "compute": "outcome"},
    "swstr_pct":            {"label": "SwStr%",             "unit": "%",   "group": "Results",  "higher_is_better": True,  "compute": "outcome"},
    "chase_pct":            {"label": "Chase%",             "unit": "%",   "group": "Results",  "higher_is_better": True,  "compute": "outcome"},
}


def compute_table_view(season_df: pd.DataFrame, n_days: int) -> dict:
    """Compare rolling-window stats vs full-season averages for all available stats."""
    available_stats = [
        {"key": k, "label": v["label"], "unit": v["unit"], "group": v["group"]}
        for k, v in TABLE_STAT_CATALOG.items()
    ]

    if season_df.empty:
        return {
            "rows": [], "rolling_start": None, "rolling_end": None,
            "season_start": None, "season_end": None,
            "n_games_season": 0, "n_games_rolling": 0,
            "available_stats": available_stats,
        }

    df = season_df.copy()
    df["_date_dt"] = pd.to_datetime(df["game_date"])
    last_date = df["_date_dt"].max()
    cutoff = last_date - pd.Timedelta(days=n_days)
    rolling_df = df[df["_date_dt"] > cutoff]

    game_dates   = sorted(df["game_date"].astype(str).unique())
    rolling_dates = sorted(rolling_df["game_date"].astype(str).unique()) if not rolling_df.empty else []

    s_out = outcome_agg(df)
    r_out = outcome_agg(rolling_df) if not rolling_df.empty else {k: None for k in OUTCOME_CONFIG}

    rows = []
    for stat_key, cfg in TABLE_STAT_CATALOG.items():
        if cfg["compute"] == "mean":
            if stat_key not in df.columns:
                continue
            sv_raw = df[stat_key].dropna().mean()
            rv_raw = rolling_df[stat_key].dropna().mean() if not rolling_df.empty else float("nan")
            season_val  = _safe(sv_raw) if not pd.isna(sv_raw) else None
            rolling_val = _safe(rv_raw) if not pd.isna(rv_raw) else None
        else:
            season_val  = s_out.get(stat_key)
            rolling_val = r_out.get(stat_key)

        if season_val is None:
            continue

        delta: float | None = None
        delta_pct: float | None = None
        if season_val is not None and rolling_val is not None:
            try:
                d = float(rolling_val) - float(season_val)
                delta = _safe(d)
                if float(season_val) != 0:
                    delta_pct = _safe(d / abs(float(season_val)) * 100)
            except (TypeError, ValueError):
                pass

        rows.append({
            "stat":             stat_key,
            "label":            cfg["label"],
            "unit":             cfg["unit"],
            "group":            cfg["group"],
            "season_avg":       season_val,
            "rolling_avg":      rolling_val,
            "delta":            delta,
            "delta_pct":        delta_pct,
            "higher_is_better": cfg["higher_is_better"],
        })

    return {
        "rows":            rows,
        "rolling_start":   rolling_dates[0] if rolling_dates else None,
        "rolling_end":     rolling_dates[-1] if rolling_dates else None,
        "season_start":    game_dates[0],
        "season_end":      game_dates[-1],
        "n_games_season":  len(game_dates),
        "n_games_rolling": len(rolling_dates),
        "available_stats": available_stats,
        "signals":         compute_signals(season_df, n_days),
    }


# ── Regression ────────────────────────────────────────────────────────────────

def _reg_col_label(col: str, pitch_types: list[str]) -> str:
    if col in OUTCOME_CONFIG:
        return OUTCOME_CONFIG[col]["label"]
    for raw, short in _METRIC_SHORT.items():
        if col == short:
            return METRIC_CONFIG[raw]["label"] + " — All Pitches"
        for pt in pitch_types:
            if col == f"{short}_{pt}":
                return f"{METRIC_CONFIG[raw]['label']} — {_pt_label(pt)}"
    return col


def build_regression_features(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    if df.empty:
        return pd.DataFrame(), {}

    metric_cols = [c for c in _METRIC_SHORT if c in df.columns]
    pitch_types = sorted(df["pitch_type"].dropna().unique())

    overall = (
        df.groupby("game_date")[metric_cols]
        .mean()
        .reset_index()
    )
    overall.columns = ["game_date"] + [_METRIC_SHORT[c] for c in metric_cols]

    pt_frames = []
    for pt in pitch_types:
        pt_sub = df[df["pitch_type"] == pt].groupby("game_date")[metric_cols].mean().reset_index()
        pt_sub.columns = ["game_date"] + [f"{_METRIC_SHORT[c]}_{pt}" for c in metric_cols]
        pt_frames.append(pt_sub)

    out_records = outcome_by_game(df)
    out_df = pd.DataFrame(out_records) if out_records else pd.DataFrame()

    overall["game_date"] = overall["game_date"].astype(str)
    result = overall.copy()
    for pt_df in pt_frames:
        pt_df["game_date"] = pt_df["game_date"].astype(str)
        result = result.merge(pt_df, on="game_date", how="outer")
    if not out_df.empty:
        result = result.merge(out_df, on="game_date", how="outer")

    result = result.sort_values("game_date").reset_index(drop=True)

    data_cols = [c for c in result.columns if c != "game_date"]
    label_map = {c: _reg_col_label(c, pitch_types) for c in data_cols}
    return result, label_map


def run_ols(
    reg_df: pd.DataFrame,
    y_col: str,
    x_cols: list[str],
    lag_cfg: dict[str, dict],
) -> dict:
    import statsmodels.api as sm
    from statsmodels.stats.outliers_influence import variance_inflation_factor, OLSInfluence
    from statsmodels.stats.stattools import durbin_watson
    from statsmodels.stats.diagnostic import het_breuschpagan
    from statsmodels.tsa.stattools import adfuller
    from scipy.stats import shapiro, probplot

    df_work = (
        reg_df[["game_date", y_col] + x_cols]
        .copy()
        .sort_values("game_date")
        .reset_index(drop=True)
    )
    for col, cfg in lag_cfg.items():
        if cfg["type"] == "lag":
            df_work[col] = df_work[col].shift(cfg["n"])
        elif cfg["type"] == "rolling":
            df_work[col] = df_work[col].shift(1).rolling(window=cfg["n"], min_periods=1).mean()
    # Diagnose sparse columns before dropping — helps the user understand why rows vanish
    n_games = len(df_work)
    sparse = [
        f"{col} ({int(df_work[col].isna().mean() * 100)}% missing)"
        for col in [y_col] + x_cols
        if col in df_work.columns and df_work[col].isna().mean() > 0.5
    ]
    df_work = df_work.dropna()

    if len(df_work) < max(len(x_cols) + 2, 5):
        min_needed = max(len(x_cols) + 2, 5)
        max_lag = max((cfg["n"] for cfg in lag_cfg.values()), default=0)
        if sparse:
            hint = (
                f"This pitcher has only {n_games} game(s) in this season. "
                f"With a max lag of {max_lag}, you need at least {max_lag + min_needed} games. "
                f"Try reducing the lag or choosing a different season."
            ) if max_lag >= n_games else (
                f"These columns have >50% missing data: {', '.join(sparse)}. "
                f"Try removing them or choosing a different season."
            )
            raise ValueError(
                f"Only {len(df_work)} usable rows after applying lags (need ≥{min_needed}). {hint}"
            )
        raise ValueError(
            f"Only {len(df_work)} usable rows after applying lags (need ≥{min_needed}). "
            f"This pitcher has {n_games} game(s) in this season — try a smaller lag or different season."
        )

    Y     = df_work[y_col].values
    X_raw = df_work[x_cols]
    X     = sm.add_constant(X_raw)
    model = sm.OLS(Y, X).fit()

    resid  = model.resid
    fitted = model.fittedvalues
    n_obs  = int(model.nobs)
    n_pred = len(x_cols)

    # ── Coefficients ──────────────────────────────────────────────────────────
    def _sig(p: float) -> str:
        if p < 0.001: return "***"
        if p < 0.01:  return "**"
        if p < 0.05:  return "*"
        if p < 0.10:  return "."
        return ""

    ci = model.conf_int()
    coefficients = [
        {
            "term":     "Intercept" if i == 0 else x_cols[i - 1],
            "coef":     _safe(model.params.iloc[i]),
            "std_err":  _safe(model.bse.iloc[i]),
            "t_stat":   _safe(model.tvalues.iloc[i]),
            "p_value":  _safe(model.pvalues.iloc[i]),
            "ci_low":   _safe(ci.iloc[i, 0]),
            "ci_high":  _safe(ci.iloc[i, 1]),
        }
        for i in range(len(model.params))
    ]

    # ── Diagnostics ───────────────────────────────────────────────────────────
    def _status_p(p: float, fail_thresh: float = 0.05) -> str:
        return "ok" if p > fail_thresh else "fail"

    sw_stat, sw_p = shapiro(resid)
    sw_status = "ok" if sw_p > 0.05 else ("warn" if sw_p > 0.01 else "fail")

    try:
        bp_lm, bp_p, *_ = het_breuschpagan(resid, model.model.exog)
        bp_entry = {"stat": _safe(bp_lm), "p_value": _safe(bp_p), "homoscedastic": bool(bp_p > 0.05)}
    except Exception:
        bp_entry = {"stat": None, "p_value": None, "homoscedastic": True}

    dw_stat = float(durbin_watson(resid))

    vif_rows = []
    if n_pred > 1:
        try:
            for i, col in enumerate(x_cols):
                v = float(variance_inflation_factor(X.values, i + 1))
                vif_rows.append({"term": col, "vif": round(v, 2)})
        except Exception:
            pass

    adf_rows = []
    for col in x_cols:
        series = df_work[col].dropna()
        if len(series) >= 8:
            try:
                adf_stat, adf_p, *_ = adfuller(series, autolag="AIC")
                adf_rows.append({
                    "col":        col,
                    "adf_stat":   _safe(adf_stat),
                    "p_value":    _safe(adf_p),
                    "stationary": bool(adf_p < 0.05),
                })
            except Exception:
                pass

    # ── Plot data ─────────────────────────────────────────────────────────────
    qq = probplot(resid, dist="norm")
    qq_theoretical, qq_sample = qq[0]
    std_resid   = resid / (resid.std() or 1)
    sqrt_absres = list(np.sqrt(np.abs(std_resid)))

    try:
        influence   = OLSInfluence(model)
        cooks_d, _  = influence.cooks_distance
        cooks_list  = [_safe(c) for c in cooks_d]
    except Exception:
        cooks_list = []

    # Correlation matrix
    corr_mat = X_raw.corr().round(3)
    corr_labels = list(corr_mat.columns)
    corr_values = corr_mat.values.tolist()

    return {
        "model_summary": {
            "r2":      _safe(model.rsquared),
            "adj_r2":  _safe(model.rsquared_adj),
            "f_stat":  _safe(model.fvalue),
            "f_pvalue": _safe(model.f_pvalue),
            "aic":     _safe(model.aic),
            "n_obs":   n_obs,
        },
        "coefficients": coefficients,
        "diagnostics": {
            "shapiro":       {"stat": _safe(sw_stat), "p_value": _safe(sw_p), "normal": bool(sw_p > 0.05)},
            "breusch_pagan": bp_entry,
            "durbin_watson": {"stat": dw_stat, "ok": bool(1.5 < dw_stat < 2.5)},
            "vif":           vif_rows,
            "adf":           adf_rows,
        },
        "plot_data": {
            "game_dates":     list(df_work["game_date"].astype(str)),
            "fitted":         [_safe(v) for v in fitted],
            "residuals":      [_safe(v) for v in resid],
            "qq_theoretical": [_safe(v) for v in qq_theoretical],
            "qq_sample":      [_safe(v) for v in qq_sample],
            "cooks":          cooks_list,
        },
        "correlation_matrix": {
            "labels": corr_labels,
            "values": corr_values,
        },
    }
