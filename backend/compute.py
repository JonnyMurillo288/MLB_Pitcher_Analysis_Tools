"""Pure computation functions — no I/O, no cache, fully serialisable outputs."""

from __future__ import annotations

import numpy as np
import pandas as pd
from datetime import date
from typing import Any

# ── Constants (mirrors Streamlit file) ────────────────────────────────────────

METRIC_CONFIG: dict[str, dict] = {
    "release_speed":     {"label": "Velocity (mph)",           "higher_is_better": True,  "fmt": ".1f"},
    "release_spin_rate": {"label": "Spin Rate (rpm)",          "higher_is_better": True,  "fmt": ".0f"},
    "pfx_x":             {"label": "Horizontal Break (in)",    "higher_is_better": None,  "fmt": ".2f"},
    "pfx_z":             {"label": "Vertical Break (in)",      "higher_is_better": None,  "fmt": ".2f"},
    "release_extension": {"label": "Extension (ft)",           "higher_is_better": True,  "fmt": ".2f"},
    "release_pos_x":     {"label": "Release Point X (ft)",     "higher_is_better": None,  "fmt": ".2f"},
    "release_pos_z":     {"label": "Release Point Z (ft)",     "higher_is_better": None,  "fmt": ".2f"},
    "effective_speed":   {"label": "Effective Velocity (mph)", "higher_is_better": True,  "fmt": ".1f"},
}

OUTCOME_CONFIG: dict[str, dict] = {
    "exit_velo":  {"label": "Exit Velocity (mph)",   "higher_is_better": False, "fmt": ".1f"},
    "gb_pct":     {"label": "GB%",                   "higher_is_better": True,  "fmt": ".1f"},
    "fb_pct":     {"label": "FB%",                   "higher_is_better": False, "fmt": ".1f"},
    "bb_per_9":   {"label": "BB/9",                  "higher_is_better": False, "fmt": ".2f"},
    "k_per_9":    {"label": "K/9",                   "higher_is_better": True,  "fmt": ".2f"},
    "whiff_pct":  {"label": "Whiff%",                "higher_is_better": True,  "fmt": ".1f"},
    "swstr_pct":  {"label": "SwStr%",                "higher_is_better": True,  "fmt": ".1f"},
    "chase_pct":  {"label": "Chase%",                "higher_is_better": True,  "fmt": ".1f"},
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
                "day_val":           _safe(d_val),
                "trend_val":         _safe(t_val),
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
    n_out_zone = (~in_zone).sum()
    n_chase    = df.loc[~in_zone, "description"].isin(_SWING_DESC).sum()
    exit_velo  = df.loc[df["launch_speed"].notna(), "launch_speed"].mean()
    total_bip  = df["bb_type"].notna().sum()
    gb_pct     = (df["bb_type"] == "ground_ball").sum() / total_bip * 100 if total_bip else float("nan")
    fb_pct     = (df["bb_type"] == "fly_ball").sum()    / total_bip * 100 if total_bip else float("nan")
    pa_df      = df[df["events"].notna()]
    tbf        = len(pa_df)
    walks      = pa_df["events"].isin(["walk", "intent_walk"]).sum()
    ks         = pa_df["events"].isin(["strikeout", "strikeout_double_play"]).sum()

    return {
        "exit_velo":  _safe(exit_velo),
        "gb_pct":     _safe(gb_pct),
        "fb_pct":     _safe(fb_pct),
        "bb_per_9":   _safe(walks / tbf * 27 if tbf else float("nan")),
        "k_per_9":    _safe(ks    / tbf * 27 if tbf else float("nan")),
        "whiff_pct":  _safe(n_swstr / n_swings  * 100 if n_swings  else float("nan")),
        "swstr_pct":  _safe(n_swstr / n_pitches * 100 if n_pitches else float("nan")),
        "chase_pct":  _safe(n_chase / n_out_zone * 100 if n_out_zone else float("nan")),
    }


def outcome_by_game(df: pd.DataFrame) -> list[dict]:
    records = []
    for gd, gdf in df.groupby("game_date"):
        row = outcome_agg(gdf)
        row["game_date"] = str(gd)
        records.append(row)
    return records


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
        if cfg["type"] == "Point lag":
            df_work[col] = df_work[col].shift(cfg["n"])
        elif cfg["type"] == "Rolling mean":
            df_work[col] = df_work[col].shift(1).rolling(window=cfg["n"], min_periods=1).mean()
    df_work = df_work.dropna()

    if len(df_work) < max(len(x_cols) + 2, 5):
        raise ValueError(f"Only {len(df_work)} usable rows after applying lags — need at least {max(len(x_cols)+2,5)}.")

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
            "variable": "Intercept" if i == 0 else x_cols[i - 1],
            "coef":     _safe(model.params.iloc[i]),
            "std_err":  _safe(model.bse.iloc[i]),
            "t_stat":   _safe(model.tvalues.iloc[i]),
            "p_value":  _safe(model.pvalues.iloc[i]),
            "ci_low":   _safe(ci.iloc[i, 0]),
            "ci_high":  _safe(ci.iloc[i, 1]),
            "sig":      _sig(float(model.pvalues.iloc[i])),
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
        bp_entry = {"lm_stat": _safe(bp_lm), "p_value": _safe(bp_p), "status": _status_p(bp_p)}
    except Exception:
        bp_entry = {"lm_stat": None, "p_value": None, "status": "warn"}

    dw_stat = float(durbin_watson(resid))
    dw_status = "ok" if 1.5 < dw_stat < 2.5 else "warn"

    vif_rows = []
    if n_pred > 1:
        try:
            for i, col in enumerate(x_cols):
                v = float(variance_inflation_factor(X.values, i + 1))
                vif_rows.append({
                    "variable": col,
                    "vif":      round(v, 2),
                    "status":   "ok" if v < 5 else ("warn" if v < 10 else "fail"),
                })
        except Exception:
            pass

    adf_rows = []
    for col in x_cols:
        series = df_work[col].dropna()
        if len(series) >= 8:
            try:
                adf_stat, adf_p, *_ = adfuller(series, autolag="AIC")
                adf_rows.append({
                    "variable": col,
                    "adf_stat": _safe(adf_stat),
                    "p_value":  _safe(adf_p),
                    "status":   "ok" if adf_p < 0.05 else "warn",
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
            "r_squared":     _safe(model.rsquared),
            "adj_r_squared": _safe(model.rsquared_adj),
            "f_stat":        _safe(model.fvalue),
            "f_pvalue":      _safe(model.f_pvalue),
            "aic":           _safe(model.aic),
            "n_observations": n_obs,
        },
        "coefficients": coefficients,
        "diagnostics": {
            "shapiro_wilk":  {"w_stat": _safe(sw_stat), "p_value": _safe(sw_p), "status": sw_status},
            "breusch_pagan": bp_entry,
            "durbin_watson": {"dw_stat": dw_stat, "status": dw_status},
            "vif":           vif_rows,
            "adf":           adf_rows,
        },
        "plot_data": {
            "game_dates":       list(df_work["game_date"].astype(str)),
            "fitted":           [_safe(v) for v in fitted],
            "residuals":        [_safe(v) for v in resid],
            "qq_theoretical":   [_safe(v) for v in qq_theoretical],
            "qq_sample":        [_safe(v) for v in qq_sample],
            "sqrt_abs_std_resid": sqrt_absres,
            "cooks_distance":   cooks_list,
            "cooks_threshold":  round(4 / n_obs, 4),
        },
        "correlation_matrix": {
            "labels": corr_labels,
            "values": corr_values,
        },
    }
