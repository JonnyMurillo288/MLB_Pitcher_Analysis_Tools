"""
Pitcher Trend Analyzer v2
Run with: streamlit run pitcher_trend_analyzer.py
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
from pybaseball import statcast_pitcher, playerid_lookup, pitching_stats
from datetime import date, timedelta
import warnings
warnings.filterwarnings("ignore")

# ── Optional regression imports ───────────────────────────────────────────────
try:
    import statsmodels.api as sm
    from statsmodels.stats.outliers_influence import variance_inflation_factor, OLSInfluence
    from statsmodels.stats.stattools import durbin_watson
    from statsmodels.stats.diagnostic import het_breuschpagan
    from statsmodels.tsa.stattools import adfuller
    from scipy.stats import shapiro, probplot
    _REG_AVAILABLE = True
except ImportError:
    _REG_AVAILABLE = False

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(page_title="Pitcher Trend Analyzer", page_icon="⚾", layout="wide")
st.title("⚾ Pitcher Trend Analyzer")
st.caption("Compare a pitcher's single-game metrics against their longer-term Statcast averages.")

# ── Constants ─────────────────────────────────────────────────────────────────
TODAY = date.today()
AVAILABLE_SEASONS = [y for y in [2021, 2022, 2023, 2024, 2025] if y <= TODAY.year]

METRIC_CONFIG = {
    "release_speed":     {"label": "Velocity (mph)",            "higher_is_better": True,  "fmt": ".1f"},
    "release_spin_rate": {"label": "Spin Rate (rpm)",           "higher_is_better": True,  "fmt": ".0f"},
    "pfx_x":             {"label": "Horizontal Break (in)",     "higher_is_better": None,  "fmt": ".2f"},
    "pfx_z":             {"label": "Vertical Break (in)",       "higher_is_better": None,  "fmt": ".2f"},
    "release_extension": {"label": "Extension (ft)",            "higher_is_better": True,  "fmt": ".2f"},
    "release_pos_x":     {"label": "Release Point X (ft)",      "higher_is_better": None,  "fmt": ".2f"},
    "release_pos_z":     {"label": "Release Point Z (ft)",      "higher_is_better": None,  "fmt": ".2f"},
    "effective_speed":   {"label": "Effective Velocity (mph)",  "higher_is_better": True,  "fmt": ".1f"},
}

PITCH_TYPE_LABELS = {
    "FF": "4-Seam FB", "SI": "Sinker",  "FC": "Cutter",      "SL": "Slider",
    "CU": "Curveball", "KC": "Kn. Curve", "CH": "Changeup",  "FS": "Splitter",
    "ST": "Sweeper",   "SV": "Slurve",  "KN": "Knuckleball", "EP": "Eephus",
    "SC": "Screwball", "FO": "Forkball","PO": "Pitchout",    "CS": "Slow Curve",
}

# ── Cached data functions ─────────────────────────────────────────────────────

@st.cache_data(ttl=86400, show_spinner="Loading qualified pitcher list…")
def get_qualified_pitchers() -> pd.DataFrame:
    """
    Pull FanGraphs pitching stats for recent seasons.
    Keep pitchers with >100 IP OR >70% of appearances as GS (and min 5 games).
    """
    seasons_to_pull = [s for s in [2022, 2023, 2024, 2025] if s <= TODAY.year]
    all_dfs = []
    for season in seasons_to_pull:
        try:
            df = pitching_stats(season, qual=1)
            df["_season"] = season
            all_dfs.append(df)
        except Exception:
            pass

    if not all_dfs:
        return pd.DataFrame(columns=["Name"])

    combined = pd.concat(all_dfs, ignore_index=True)
    combined["IP"] = pd.to_numeric(combined["IP"], errors="coerce").fillna(0)
    combined["G"]  = pd.to_numeric(combined["G"],  errors="coerce").fillna(0)
    combined["GS"] = pd.to_numeric(combined["GS"], errors="coerce").fillna(0)
    combined["gs_pct"] = combined["GS"] / combined["G"].replace(0, np.nan)

    qualified = combined[
        (combined["G"] >= 5) &
        ((combined["IP"] > 100) | (combined["gs_pct"] > 0.70))
    ].copy()

    # One row per player — take most recent season
    qualified = (
        qualified
        .sort_values("_season", ascending=False)
        .drop_duplicates("Name", keep="first")
        .sort_values("Name")
        .reset_index(drop=True)
    )
    return qualified[["Name", "Team", "IP", "G", "GS", "gs_pct", "_season"]]


@st.cache_data(ttl=86400, show_spinner="Looking up pitcher ID…")
def get_mlbam_id(full_name: str):
    parts = full_name.strip().split()
    if len(parts) < 2:
        return None
    first = parts[0]
    last  = " ".join(parts[1:])
    res   = playerid_lookup(last, first)
    if res.empty:
        return None
    rows = res[res["mlb_played_last"].notna()]
    if rows.empty:
        rows = res
    return int(rows.sort_values("mlb_played_last", ascending=False).iloc[0]["key_mlbam"])


@st.cache_data(ttl=3600, show_spinner="Fetching Statcast data…")
def fetch_season(pid: int, year: int) -> pd.DataFrame:
    end_dt = TODAY if year == TODAY.year else date(year, 11, 30)
    df = statcast_pitcher(f"{year}-03-01", end_dt.strftime("%Y-%m-%d"), pid)
    if df is None or df.empty:
        return pd.DataFrame()
    df["game_date"] = pd.to_datetime(df["game_date"]).dt.date
    return df


# ── Utilities ─────────────────────────────────────────────────────────────────

def pt_label(pt: str) -> str:
    return PITCH_TYPE_LABELS.get(str(pt), str(pt))


def build_trend_df(
    pid: int,
    target_date: date,
    trend_type: str,
    n_days: int,
    trend_season: int,
    season_cache: dict,
) -> pd.DataFrame:
    if trend_type == "Rolling Window":
        cutoff = target_date - timedelta(days=n_days)
        frames = [
            df[(df["game_date"] >= cutoff) & (df["game_date"] < target_date)]
            for df in season_cache.values()
            if not df.empty
        ]
        frames = [f for f in frames if not f.empty]
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    else:  # Full Season
        yr_df = season_cache.get(trend_season, pd.DataFrame())
        if yr_df.empty:
            # Fetch on demand (will be cached after first call)
            yr_df = fetch_season(pid, trend_season)
            season_cache[trend_season] = yr_df
        return yr_df[yr_df["game_date"] != target_date] if not yr_df.empty else pd.DataFrame()


def compute_comparison(
    day_df: pd.DataFrame,
    trend_df: pd.DataFrame,
    metrics: list,
    pitch_types: list,
) -> pd.DataFrame:
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
            t_val = t_sub[metric].dropna().mean() if not t_sub.empty else np.nan

            if pd.isna(d_val):
                continue

            delta     = d_val - t_val if not pd.isna(t_val) else np.nan
            delta_pct = (delta / abs(t_val) * 100) if (not pd.isna(t_val) and t_val != 0) else np.nan

            rows.append({
                "pitch_type":  pt,
                "pitch_label": pt_label(pt),
                "metric":      metric,
                "metric_label": METRIC_CONFIG[metric]["label"],
                "day_val":     d_val,
                "trend_val":   t_val,
                "delta":       delta,
                "delta_pct":   delta_pct,
                "n_today":     len(d_sub[metric].dropna()),
                "n_trend":     len(t_sub[metric].dropna()) if not t_sub.empty else 0,
                "fmt":         METRIC_CONFIG[metric]["fmt"],
                "higher_is_better": METRIC_CONFIG[metric]["higher_is_better"],
            })
    return pd.DataFrame(rows)


def delta_css(row) -> str:
    if row["higher_is_better"] is None or pd.isna(row["delta"]):
        return "off"
    return "normal" if row["higher_is_better"] else "inverse"


# Statcast description sets used for outcome calculations
_SWSTR_DESC  = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}
_SWING_DESC  = _SWSTR_DESC | {"foul", "foul_bunt", "foul_pitchout",
                               "hit_into_play", "hit_into_play_no_out",
                               "hit_into_play_score"}

OUTCOME_CONFIG = {
    "exit_velo":  {"label": "Exit Velocity (mph)",    "higher_is_better": False, "fmt": ".1f"},
    "gb_pct":     {"label": "GB%",                    "higher_is_better": True,  "fmt": ".1f"},
    "fb_pct":     {"label": "FB%",                    "higher_is_better": False, "fmt": ".1f"},
    "bb_per_9":   {"label": "BB/9",                   "higher_is_better": False, "fmt": ".2f"},
    "k_per_9":    {"label": "K/9",                    "higher_is_better": True,  "fmt": ".2f"},
    "whiff_pct":  {"label": "Whiff%",                 "higher_is_better": True,  "fmt": ".1f"},
    "swstr_pct":  {"label": "SwStr%",                 "higher_is_better": True,  "fmt": ".1f"},
    "chase_pct":  {"label": "Chase%",                 "higher_is_better": True,  "fmt": ".1f"},
}


def _outcome_agg(df: pd.DataFrame) -> dict:
    """Compute aggregate outcome stats from a pitch-level DataFrame."""
    if df.empty:
        return {k: np.nan for k in OUTCOME_CONFIG}

    n_pitches = len(df)
    n_swstr   = df["description"].isin(_SWSTR_DESC).sum()
    n_swings  = df["description"].isin(_SWING_DESC).sum()

    # Zone: 1-9 = in zone, anything else (11-14, NaN) = outside
    in_zone    = df["zone"].between(1, 9, inclusive="both")
    n_out_zone = (~in_zone).sum()
    n_chase    = df.loc[~in_zone, "description"].isin(_SWING_DESC).sum()

    # Exit velocity (balls in play only)
    exit_velo = df.loc[df["launch_speed"].notna(), "launch_speed"].mean()

    # GB / FB
    total_bip = df["bb_type"].notna().sum()
    gb_pct = (df["bb_type"] == "ground_ball").sum() / total_bip * 100 if total_bip else np.nan
    fb_pct = (df["bb_type"] == "fly_ball").sum()    / total_bip * 100 if total_bip else np.nan

    # BB / K — use last pitch of each PA (events column is non-null only on the final pitch)
    pa_df = df[df["events"].notna()]
    tbf   = len(pa_df)
    walks = pa_df["events"].isin(["walk", "intent_walk"]).sum()
    ks    = pa_df["events"].isin(["strikeout", "strikeout_double_play"]).sum()
    bb_per_9 = walks / tbf * 27 if tbf else np.nan
    k_per_9  = ks    / tbf * 27 if tbf else np.nan

    return {
        "exit_velo":  exit_velo,
        "gb_pct":     gb_pct,
        "fb_pct":     fb_pct,
        "bb_per_9":   bb_per_9,
        "k_per_9":    k_per_9,
        "whiff_pct":  n_swstr / n_swings  * 100 if n_swings  else np.nan,
        "swstr_pct":  n_swstr / n_pitches * 100 if n_pitches else np.nan,
        "chase_pct":  n_chase / n_out_zone * 100 if n_out_zone else np.nan,
    }


def compute_outcome_by_game(df: pd.DataFrame) -> pd.DataFrame:
    """Return a per-game-date DataFrame of outcome stats."""
    records = []
    for gd, gdf in df.groupby("game_date"):
        row = _outcome_agg(gdf)
        row["game_date"] = gd
        records.append(row)
    out = pd.DataFrame(records)
    if not out.empty:
        out["game_date"] = out["game_date"].astype(str)
    return out


# Short column prefixes used when building the regression DataFrame
_METRIC_SHORT = {
    "release_speed":     "velo",
    "release_spin_rate": "spin",
    "pfx_x":             "break_h",
    "pfx_z":             "break_v",
    "release_extension": "ext",
    "release_pos_x":     "rel_x",
    "release_pos_z":     "rel_z",
    "effective_speed":   "eff_velo",
}


def _reg_col_label(col: str, pitch_types_in_data: list) -> str:
    """Human-readable label for a regression DataFrame column."""
    if col in OUTCOME_CONFIG:
        return OUTCOME_CONFIG[col]["label"]
    for raw, short in _METRIC_SHORT.items():
        if col == short:
            return METRIC_CONFIG[raw]["label"] + " — All Pitches"
        for pt in pitch_types_in_data:
            if col == f"{short}_{pt}":
                return f"{METRIC_CONFIG[raw]['label']} — {pt_label(pt)}"
    return col


def build_regression_df(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Build a per-game DataFrame of all available predictor / outcome columns.
    Returns (DataFrame, label_dict) where label_dict maps col_name -> display_label.
    """
    if df.empty:
        return pd.DataFrame(), {}

    metric_cols   = [c for c in _METRIC_SHORT if c in df.columns]
    pitch_types   = sorted(df["pitch_type"].dropna().unique())

    # ── Overall pitch metric averages ─────────────────────────────────────────
    overall = (
        df.groupby("game_date")[metric_cols]
        .mean()
        .reset_index()
    )
    overall.columns = ["game_date"] + [_METRIC_SHORT[c] for c in metric_cols]

    # ── Per-pitch-type metric averages ────────────────────────────────────────
    pt_frames = []
    for pt in pitch_types:
        pt_sub = df[df["pitch_type"] == pt].groupby("game_date")[metric_cols].mean().reset_index()
        pt_sub.columns = ["game_date"] + [f"{_METRIC_SHORT[c]}_{pt}" for c in metric_cols]
        pt_frames.append(pt_sub)

    # ── Outcome stats ─────────────────────────────────────────────────────────
    out_df = compute_outcome_by_game(df)
    if not out_df.empty:
        out_df["game_date"] = out_df["game_date"].astype(str)

    # ── Merge ─────────────────────────────────────────────────────────────────
    overall["game_date"] = overall["game_date"].astype(str)
    result = overall.copy()
    for pt_df in pt_frames:
        pt_df["game_date"] = pt_df["game_date"].astype(str)
        result = result.merge(pt_df, on="game_date", how="outer")
    if not out_df.empty:
        result = result.merge(out_df, on="game_date", how="outer")

    result = result.sort_values("game_date").reset_index(drop=True)

    # ── Label map ─────────────────────────────────────────────────────────────
    data_cols   = [c for c in result.columns if c != "game_date"]
    label_map   = {c: _reg_col_label(c, pitch_types) for c in data_cols}

    return result, label_map


# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Pitcher")

    pitchers_df = get_qualified_pitchers()
    if pitchers_df.empty:
        st.error("Could not load pitcher list.")
        st.stop()

    pitcher_names = pitchers_df["Name"].tolist()
    pitcher_name = st.selectbox(
        "Search pitcher name",
        options=pitcher_names,
        index=pitcher_names.index("Tarik Skubal") if "Tarik Skubal" in pitcher_names else 0,
        help="Type to search — only pitchers with >100 IP or >70% GS are shown.",
    )

    data_season = st.selectbox(
        "Season to pull game dates from",
        options=AVAILABLE_SEASONS,
        index=len(AVAILABLE_SEASONS) - 1,
    )

    # ── Resolve pitcher ID and fetch season data ───────────────────────────────
    pid = get_mlbam_id(pitcher_name)
    if pid is None:
        st.error(f"Could not resolve MLB ID for **{pitcher_name}**.")
        st.stop()

    season_df = fetch_season(pid, data_season)

    if season_df.empty:
        st.warning(f"No Statcast data found for {pitcher_name} in {data_season}.")
        st.stop()

    # ── Game date dropdown ─────────────────────────────────────────────────────
    st.divider()
    st.header("Game Date")

    game_dates = sorted(season_df["game_date"].unique(), reverse=True)
    target_date = st.selectbox(
        "Select a game",
        options=game_dates,
        format_func=lambda d: d.strftime("%b %d, %Y") + f"  ({(season_df[season_df['game_date']==d]['pitch_type'].count())} pitches)",
    )

    # ── Trend window ───────────────────────────────────────────────────────────
    st.divider()
    st.header("Trend Window")

    trend_type = st.radio(
        "Trend type",
        ["Rolling Window", "Full Season"],
        horizontal=True,
    )

    n_days = None
    trend_season = None

    if trend_type == "Rolling Window":
        n_days = st.slider("Days back from target date", min_value=7, max_value=90, value=30, step=7)
        trend_label = f"Last {n_days} days"
    else:
        # Default to the season before the data season if possible
        default_trend_season = max(data_season - 1, AVAILABLE_SEASONS[0])
        trend_season = st.selectbox(
            "Trend Season",
            options=AVAILABLE_SEASONS,
            index=AVAILABLE_SEASONS.index(default_trend_season),
        )
        trend_label = f"Full {trend_season} Season"

    # ── Pitch type filter ──────────────────────────────────────────────────────
    st.divider()
    st.header("Pitch Types")

    # Show pitch types from this pitcher's full season (not just target date)
    all_pitcher_pitches = sorted(season_df["pitch_type"].dropna().unique())
    selected_pitches = st.multiselect(
        "Pitch types to analyze",
        options=all_pitcher_pitches,
        default=all_pitcher_pitches,
        format_func=pt_label,
    )

    # ── Metrics ───────────────────────────────────────────────────────────────
    st.divider()
    st.header("Metrics")

    selected_metrics = st.multiselect(
        "Metrics to compare",
        options=list(METRIC_CONFIG.keys()),
        default=["release_speed", "release_spin_rate", "pfx_x", "pfx_z", "release_extension"],
        format_func=lambda k: METRIC_CONFIG[k]["label"],
    )

    st.divider()
    run_btn = st.button("Run Analysis", type="primary", use_container_width=True)


# ── Main panel ────────────────────────────────────────────────────────────────
if not run_btn:
    st.info("Configure pitcher, date, and trend settings in the sidebar, then click **Run Analysis**.")
    with st.expander("How it works"):
        st.markdown("""
- **Pitcher list** — only starters/high-usage pitchers (>100 IP or >70% GS appearances).
- **Game date** — choose from actual dates the pitcher took the mound.
- **Trend window** — rolling N days *before* the target game, or an entire past season.
- **Pitch type filter** — analyze any subset of the pitcher's arsenal, metric by metric.
- **Metrics** — velocity, spin rate, movement, extension, release point, effective velo.
        """)
    st.stop()

# ── Build trend dataset ───────────────────────────────────────────────────────
season_cache = {data_season: season_df}

with st.spinner("Building trend dataset…"):
    day_df   = season_df[season_df["game_date"] == target_date]
    trend_df = build_trend_df(pid, target_date, trend_type, n_days, trend_season, season_cache)

if day_df.empty:
    st.error(f"No pitch data found for {target_date}.")
    st.stop()

if not selected_pitches:
    st.warning("Select at least one pitch type in the sidebar.")
    st.stop()

if not selected_metrics:
    st.warning("Select at least one metric in the sidebar.")
    st.stop()

# Filter to selected pitch types
day_filt   = day_df[day_df["pitch_type"].isin(selected_pitches)]
trend_filt = trend_df[trend_df["pitch_type"].isin(selected_pitches)] if not trend_df.empty else pd.DataFrame()

# ── Shared header ─────────────────────────────────────────────────────────────
st.subheader(f"{pitcher_name} — {target_date.strftime('%B %d, %Y')}  vs.  {trend_label}")

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Pitches Today",     len(day_filt))
c2.metric("Pitches in Trend",  len(trend_filt))
c3.metric("Pitch Types Today", day_filt["pitch_type"].nunique())
c4.metric("Batters Faced",     day_df["batter"].nunique() if "batter" in day_df.columns else "—")
c5.metric("Season (data)",     data_season)

tab_metrics, tab_outcomes, tab_reg = st.tabs(["📊 Pitch Metrics", "📈 Outcome Stats", "📐 Regression"])

# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — PITCH METRICS
# ══════════════════════════════════════════════════════════════════════════════
with tab_metrics:

    # ── Pitch usage comparison ────────────────────────────────────────────────
    st.divider()
    st.subheader("Pitch Usage")

    usage_cols = st.columns(2)
    for col, (df_u, title) in zip(usage_cols, [
        (day_filt,   f"{target_date.strftime('%b %d, %Y')} — {len(day_filt)} pitches"),
        (trend_filt, f"{trend_label} — {len(trend_filt)} pitches"),
    ]):
        if df_u.empty:
            col.info("No data.")
            continue
        usage = (
            df_u["pitch_type"].value_counts()
            .rename_axis("pitch_type")
            .reset_index(name="count")
        )
        usage["label"] = usage["pitch_type"].map(pt_label)
        fig = px.pie(usage, names="label", values="count", title=title, hole=0.35)
        fig.update_traces(textposition="inside", textinfo="percent+label")
        fig.update_layout(showlegend=False, margin=dict(t=40, b=0, l=0, r=0), height=280)
        col.plotly_chart(fig, use_container_width=True)

    # ── Metric × Pitch Type comparison grid ──────────────────────────────────
    st.divider()
    st.subheader("Metric Comparison by Pitch Type")
    st.caption("Each row = one metric. Each column = one pitch type. Today vs. trend average.")

    cmp_df = compute_comparison(day_filt, trend_filt, selected_metrics, selected_pitches)

    if cmp_df.empty:
        st.warning("No comparison data. The selected pitch types may not have appeared on the target date.")
    else:
        for metric in selected_metrics:
            m_df = cmp_df[cmp_df["metric"] == metric]
            if m_df.empty:
                continue
            st.markdown(f"**{METRIC_CONFIG[metric]['label']}**")
            cols = st.columns(max(len(m_df), 1))
            for col, (_, row) in zip(cols, m_df.iterrows()):
                fmt_str   = f"{{:{row['fmt']}}}"
                d_str     = fmt_str.format(row["day_val"])
                t_str     = fmt_str.format(row["trend_val"]) if not pd.isna(row["trend_val"]) else "N/A"
                delta_str = None
                if not pd.isna(row["delta"]):
                    try:
                        dec = int(row["fmt"].split(".")[1][0])
                    except Exception:
                        dec = 1
                    delta_str = f"{row['delta']:+.{dec}f}  ({row['delta_pct']:+.1f}%)"
                col.metric(
                    label=row["pitch_label"] + f"  (n={row['n_today']})",
                    value=d_str,
                    delta=delta_str,
                    delta_color=delta_css(row),
                    help=f"Trend avg: {t_str}  |  n={row['n_trend']} pitches in trend window",
                )
            st.write("")

    # ── Time-series chart per metric ──────────────────────────────────────────
    st.divider()
    st.subheader("Metric Trends Over Time")

    plot_df = season_df[season_df["pitch_type"].isin(selected_pitches)].copy()
    target_date_str = str(target_date)

    for metric in selected_metrics:
        if metric not in plot_df.columns:
            continue
        daily = (
            plot_df.groupby(["game_date", "pitch_type"])[metric]
            .mean()
            .reset_index()
            .rename(columns={metric: "value"})
        )
        daily["pitch_label"] = daily["pitch_type"].map(pt_label)
        daily = daily.dropna(subset=["value"])
        if daily.empty:
            continue
        daily["game_date"] = daily["game_date"].astype(str)

        fig = px.line(
            daily, x="game_date", y="value", color="pitch_label", markers=True,
            title=METRIC_CONFIG[metric]["label"],
            labels={"game_date": "Date", "value": METRIC_CONFIG[metric]["label"], "pitch_label": "Pitch"},
        )
        fig.add_shape(
            type="line", x0=target_date_str, x1=target_date_str, y0=0, y1=1,
            xref="x", yref="paper", line=dict(dash="dash", color="red", width=2),
        )
        fig.add_annotation(
            x=target_date_str, y=1, xref="x", yref="paper",
            text="Target", showarrow=False, xanchor="left", yanchor="top",
            font=dict(color="red", size=11),
        )
        if trend_type == "Rolling Window" and n_days:
            cutoff = target_date - timedelta(days=n_days)
            fig.add_shape(
                type="rect", x0=str(cutoff), x1=target_date_str, y0=0, y1=1,
                xref="x", yref="paper", fillcolor="rgba(255,255,0,0.07)",
                line_width=0, layer="below",
            )
            fig.add_annotation(
                x=str(cutoff), y=1, xref="x", yref="paper",
                text=f"{n_days}d trend", showarrow=False, xanchor="left", yanchor="top",
                font=dict(color="rgba(200,200,100,0.9)", size=10),
            )
        if not cmp_df.empty:
            for _, row in cmp_df[cmp_df["metric"] == metric].iterrows():
                if not pd.isna(row["trend_val"]):
                    fig.add_hline(
                        y=row["trend_val"], line_dash="dot", line_width=1,
                        annotation_text=f"{row['pitch_label']} trend avg",
                        annotation_position="bottom right",
                    )
        fig.update_layout(height=340, margin=dict(t=50, b=30))
        st.plotly_chart(fig, use_container_width=True)

    # ── Delta bar chart ───────────────────────────────────────────────────────
    if not cmp_df.empty and cmp_df["delta_pct"].notna().any():
        st.divider()
        st.subheader("% Deviation from Trend Average")
        metrics_in_cmp = [m for m in selected_metrics if m in cmp_df["metric"].values]
        if metrics_in_cmp:
            fig_d = make_subplots(
                rows=1, cols=len(metrics_in_cmp),
                subplot_titles=[METRIC_CONFIG[m]["label"] for m in metrics_in_cmp],
            )
            for ci, metric in enumerate(metrics_in_cmp, start=1):
                m_df = cmp_df[(cmp_df["metric"] == metric) & cmp_df["delta_pct"].notna()]
                if m_df.empty:
                    continue
                bar_colors = []
                for _, row in m_df.iterrows():
                    if row["higher_is_better"] is None:
                        bar_colors.append("steelblue")
                    elif (row["delta"] > 0) == row["higher_is_better"]:
                        bar_colors.append("#2ecc71")
                    else:
                        bar_colors.append("#e74c3c")
                fig_d.add_trace(
                    go.Bar(
                        x=m_df["pitch_label"], y=m_df["delta_pct"],
                        marker_color=bar_colors,
                        text=[f"{v:+.1f}%" for v in m_df["delta_pct"]],
                        textposition="outside", showlegend=False,
                    ),
                    row=1, col=ci,
                )
                fig_d.update_yaxes(title_text="% vs trend", row=1, col=ci)
            fig_d.update_layout(height=380, title_text="% Deviation from Trend (green = better, red = worse)")
            st.plotly_chart(fig_d, use_container_width=True)

    # ── Velocity vs Spin scatter ──────────────────────────────────────────────
    if {"release_speed", "release_spin_rate"}.issubset(set(day_filt.columns)):
        st.divider()
        st.subheader(f"Velocity vs. Spin Rate — Individual Pitches ({target_date})")
        sc_df = day_filt[["release_speed", "release_spin_rate", "pitch_type"]].dropna().copy()
        sc_df["pitch_label"] = sc_df["pitch_type"].map(pt_label)
        fig_sc = px.scatter(
            sc_df, x="release_speed", y="release_spin_rate", color="pitch_label", opacity=0.75,
            labels={"release_speed": "Velocity (mph)", "release_spin_rate": "Spin Rate (rpm)", "pitch_label": "Pitch"},
        )
        fig_sc.update_layout(height=380)
        st.plotly_chart(fig_sc, use_container_width=True)

    # ── Raw data expanders ────────────────────────────────────────────────────
    with st.expander("Raw Data — Today's Pitches"):
        show_cols = (
            ["game_date", "pitch_type", "pitch_name"]
            + [m for m in selected_metrics if m in day_filt.columns]
            + ["description", "events"]
        )
        show_cols = [c for c in show_cols if c in day_filt.columns]
        st.dataframe(day_filt[show_cols].sort_values("pitch_type"), use_container_width=True)

    with st.expander(f"Trend Aggregates — {trend_label}"):
        if not trend_filt.empty:
            agg_cols = ["pitch_type"] + [m for m in selected_metrics if m in trend_filt.columns]
            agg = (
                trend_filt[agg_cols]
                .groupby("pitch_type")
                .agg(["mean", "std", "count"])
                .round(2)
            )
            agg.index = agg.index.map(pt_label)
            st.dataframe(agg, use_container_width=True)
        else:
            st.info("No trend data available for this configuration.")

# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — OUTCOME STATS
# ══════════════════════════════════════════════════════════════════════════════
with tab_outcomes:

    # Compute aggregate outcome stats for today and trend period
    day_out   = _outcome_agg(day_df)
    trend_out = _outcome_agg(trend_df) if not trend_df.empty else {k: np.nan for k in OUTCOME_CONFIG}

    # Per-game time series across the full season (for charts)
    game_out_df = compute_outcome_by_game(season_df)
    tds = str(target_date)

    # ── Outcome KPI cards (today vs trend) ───────────────────────────────────
    st.divider()
    st.subheader("Today vs. Trend")

    stat_keys = list(OUTCOME_CONFIG.keys())
    for keys in [stat_keys[:4], stat_keys[4:]]:
        cols = st.columns(len(keys))
        for col, key in zip(cols, keys):
            cfg   = OUTCOME_CONFIG[key]
            d_val = day_out.get(key, np.nan)
            t_val = trend_out.get(key, np.nan)
            if pd.isna(d_val):
                col.metric(cfg["label"], "N/A")
                continue
            fmt_str   = f"{{:{cfg['fmt']}}}"
            delta_str = None
            d_color   = "off"
            if not pd.isna(t_val) and t_val != 0:
                delta = d_val - t_val
                d_pct = delta / abs(t_val) * 100
                try:
                    dec = int(cfg["fmt"].split(".")[1][0])
                except Exception:
                    dec = 1
                delta_str = f"{delta:+.{dec}f}  ({d_pct:+.1f}%)"
                d_color   = "normal" if cfg["higher_is_better"] else "inverse"
            col.metric(
                label=cfg["label"],
                value=fmt_str.format(d_val),
                delta=delta_str,
                delta_color=d_color,
                help=f"Trend avg: {fmt_str.format(t_val) if not pd.isna(t_val) else 'N/A'}",
            )

    # ── Charts: pitch usage (left) | outcome stat trends (right) ─────────────
    st.divider()
    st.subheader("Trends Over Time")

    left_col, right_col = st.columns([1, 2])

    with left_col:
        st.markdown("**Pitch Usage**")
        for df_u, pie_title in [
            (day_df,   f"{target_date.strftime('%b %d, %Y')}"),
            (trend_df if not trend_df.empty else pd.DataFrame(), trend_label),
        ]:
            if df_u.empty:
                st.info(f"No data — {pie_title}")
                continue
            usage = (
                df_u["pitch_type"].value_counts()
                .rename_axis("pitch_type")
                .reset_index(name="count")
            )
            usage["label"] = usage["pitch_type"].map(pt_label)
            fig_pie = px.pie(usage, names="label", values="count", title=pie_title, hole=0.35)
            fig_pie.update_traces(textposition="inside", textinfo="percent+label")
            fig_pie.update_layout(showlegend=False, margin=dict(t=40, b=10, l=0, r=0), height=250)
            st.plotly_chart(fig_pie, use_container_width=True)

    with right_col:
        if game_out_df.empty:
            st.info("No per-game data available.")
        else:
            for key in stat_keys:
                cfg = OUTCOME_CONFIG[key]
                if key not in game_out_df.columns:
                    continue
                plot_data = game_out_df[["game_date", key]].dropna(subset=[key])
                if plot_data.empty:
                    continue
                fig_o = px.line(
                    plot_data, x="game_date", y=key, markers=True,
                    title=cfg["label"],
                    labels={"game_date": "Date", key: cfg["label"]},
                )
                # Target date marker
                fig_o.add_shape(
                    type="line", x0=tds, x1=tds, y0=0, y1=1,
                    xref="x", yref="paper", line=dict(dash="dash", color="red", width=2),
                )
                fig_o.add_annotation(
                    x=tds, y=1, xref="x", yref="paper",
                    text="Target", showarrow=False, xanchor="left", yanchor="top",
                    font=dict(color="red", size=10),
                )
                # Rolling window shade
                if trend_type == "Rolling Window" and n_days:
                    cutoff_str = str(target_date - timedelta(days=n_days))
                    fig_o.add_shape(
                        type="rect", x0=cutoff_str, x1=tds, y0=0, y1=1,
                        xref="x", yref="paper", fillcolor="rgba(255,255,0,0.07)",
                        line_width=0, layer="below",
                    )
                # Trend avg dotted line
                t_val = trend_out.get(key, np.nan)
                if not pd.isna(t_val):
                    fig_o.add_hline(
                        y=t_val, line_dash="dot", line_width=1,
                        annotation_text="trend avg", annotation_position="bottom right",
                    )
                fig_o.update_layout(height=260, margin=dict(t=40, b=20))
                st.plotly_chart(fig_o, use_container_width=True)

# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — REGRESSION ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════
with tab_reg:

    if not _REG_AVAILABLE:
        st.error("statsmodels / scipy not installed. Run: `pip install statsmodels scipy`")
        st.stop()

    # ── Build per-game feature DataFrame ─────────────────────────────────────
    reg_df, label_map = build_regression_df(season_df)

    if reg_df.empty or len(reg_df) < 5:
        st.warning("Not enough games in the selected season to run a regression.")
        st.stop()

    data_cols  = [c for c in reg_df.columns if c != "game_date"]
    label_opts = {c: label_map.get(c, c) for c in data_cols}

    # ── Variable selection ────────────────────────────────────────────────────
    st.divider()
    st.subheader("Variable Selection")

    vcol_y, vcol_x = st.columns([1, 2])

    with vcol_y:
        y_col = st.selectbox(
            "Outcome (Y)",
            options=data_cols,
            index=data_cols.index("exit_velo") if "exit_velo" in data_cols else 0,
            format_func=lambda c: label_opts[c],
        )

    with vcol_x:
        x_default = [c for c in data_cols if c != y_col and c in ("velo", "spin", "break_h", "break_v", "ext")]
        x_cols = st.multiselect(
            "Predictors (X) — select one or more",
            options=[c for c in data_cols if c != y_col],
            default=x_default[:3],
            format_func=lambda c: label_opts[c],
        )

    if not x_cols:
        st.info("Select at least one predictor variable.")
        st.stop()

    # ── Lag / window configuration ────────────────────────────────────────────
    st.divider()
    st.subheader("Lag / Window Configuration")
    st.caption(
        "Point lag: use value from N games prior.  "
        "Rolling mean: average of last N games (ending one game before target).  "
        "Use 'None' to keep the raw same-game value."
    )

    lag_cfg = {}
    lag_cols = st.columns(min(len(x_cols), 4))
    for i, col in enumerate(x_cols):
        with lag_cols[i % len(lag_cols)]:
            st.markdown(f"**{label_opts[col]}**")
            lag_type = st.radio(
                "Type", ["None", "Point lag", "Rolling mean"],
                key=f"lagtype_{col}", horizontal=True,
            )
            lag_n = 1
            if lag_type != "None":
                lag_n = st.slider("N games", 1, 15, 3, key=f"lagn_{col}")
            lag_cfg[col] = {"type": lag_type, "n": lag_n}

    # ── Input signature — used to detect stale results ────────────────────────
    _reg_sig = (
        pitcher_name, data_season, y_col,
        tuple(x_cols),
        tuple(sorted((k, v["type"], v["n"]) for k, v in lag_cfg.items())),
    )

    # ── Run / session-state controls ──────────────────────────────────────────
    st.divider()
    btn_col, note_col = st.columns([1, 4])
    run_reg = btn_col.button("Run Regression", type="primary")

    _rr = st.session_state.get("_reg_results")
    _stale = (_rr is not None) and (_rr.get("sig") != _reg_sig)
    if _stale:
        note_col.warning("Inputs changed — click **Run Regression** to update results.")
    elif _rr is None:
        note_col.info("Configure variables and lags above, then click **Run Regression**.")

    # ── Fit model (only on button press) ─────────────────────────────────────
    if run_reg:
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
            st.error(f"Only {len(df_work)} complete observations after lags — not enough to fit a model.")
        else:
            Y_fit   = df_work[y_col].values
            Xr_fit  = df_work[x_cols]
            X_fit   = sm.add_constant(Xr_fit)
            try:
                _model = sm.OLS(Y_fit, X_fit).fit()
                st.session_state["_reg_results"] = {
                    "sig":        _reg_sig,
                    "model":      _model,
                    "df_work":    df_work,
                    "Y":          Y_fit,
                    "X_raw":      Xr_fit,
                    "X":          X_fit,
                    "x_cols":     x_cols,
                    "y_col":      y_col,
                    "label_opts": label_opts,
                }
                _rr    = st.session_state["_reg_results"]
                _stale = False
            except Exception as e:
                st.error(f"OLS fitting failed: {e}")

    # ── Nothing to display yet ────────────────────────────────────────────────
    if st.session_state.get("_reg_results") is None:
        st.stop()

    # ── Unpack stored results ─────────────────────────────────────────────────
    _rr       = st.session_state["_reg_results"]
    model     = _rr["model"]
    df_work   = _rr["df_work"]
    Y         = _rr["Y"]
    X_raw     = _rr["X_raw"]
    X         = _rr["X"]
    x_cols    = _rr["x_cols"]
    y_col     = _rr["y_col"]
    label_opts = _rr["label_opts"]

    resid   = model.resid
    fitted  = model.fittedvalues
    n_obs   = int(model.nobs)
    n_pred  = len(x_cols)

    # ── Section 1: Model Performance ─────────────────────────────────────────
    st.divider()
    st.subheader("Model Performance")

    pm = st.columns(6)
    pm[0].metric("R²",       f"{model.rsquared:.3f}")
    pm[1].metric("Adj R²",   f"{model.rsquared_adj:.3f}")
    pm[2].metric("F-stat",   f"{model.fvalue:.2f}")
    pm[3].metric("F p-val",  f"{model.f_pvalue:.4f}")
    pm[4].metric("AIC",      f"{model.aic:.1f}")
    pm[5].metric("Obs",      n_obs)

    # ── Section 2: Coefficient Table ─────────────────────────────────────────
    st.divider()
    st.subheader("Coefficients")

    coef_df = pd.DataFrame({
        "Variable": ["Intercept"] + [label_opts[c] for c in x_cols],
        "Coef":     model.params.values,
        "Std Err":  model.bse.values,
        "t":        model.tvalues.values,
        "p-value":  model.pvalues.values,
        "CI low":   model.conf_int()[0].values,
        "CI high":  model.conf_int()[1].values,
    })

    def _sig_marker(p):
        if p < 0.001: return "***"
        if p < 0.01:  return "**"
        if p < 0.05:  return "*"
        if p < 0.10:  return "."
        return ""

    coef_df["Sig"] = coef_df["p-value"].apply(_sig_marker)
    coef_df = coef_df.round(4)

    def _color_pval(val):
        if isinstance(val, float):
            if val < 0.05:  return "color: #2ecc71"
            if val < 0.10:  return "color: #f39c12"
            return "color: #e74c3c"
        return ""

    st.dataframe(
        coef_df.style.applymap(_color_pval, subset=["p-value"]),
        use_container_width=True,
        hide_index=True,
    )
    st.caption("Significance: *** p<0.001  ** p<0.01  * p<0.05  . p<0.10")

    # ── Section 3: Assumption Tests ───────────────────────────────────────────
    st.divider()
    st.subheader("Regression Assumptions")

    def _badge(label: str, value: str, status: str, detail: str = ""):
        """Render a colored status card."""
        colors = {"ok": "#2ecc71", "warn": "#f39c12", "fail": "#e74c3c"}
        color  = colors.get(status, "#888")
        st.markdown(
            f"""<div style="border-left:4px solid {color}; padding:8px 12px; margin-bottom:8px; background:#1a1a2e; border-radius:4px">
            <b style="color:{color}">{label}</b><br>
            <span style="font-size:1.1em">{value}</span>
            {"<br><small>" + detail + "</small>" if detail else ""}
            </div>""",
            unsafe_allow_html=True,
        )

    acol1, acol2 = st.columns(2)

    # ── Normality of residuals ───────────────────────────────────────────────
    with acol1:
        st.markdown("**Normality of Residuals (Shapiro-Wilk)**")
        sw_stat, sw_p = shapiro(resid)
        if sw_p > 0.05:
            _badge("Shapiro-Wilk", f"W = {sw_stat:.4f},  p = {sw_p:.4f}", "ok",
                   "Residuals appear normally distributed.")
        elif sw_p > 0.01:
            _badge("Shapiro-Wilk", f"W = {sw_stat:.4f},  p = {sw_p:.4f}", "warn",
                   "Marginal normality — interpret with caution.")
        else:
            _badge("Shapiro-Wilk", f"W = {sw_stat:.4f},  p = {sw_p:.4f}", "fail",
                   "Residuals are not normally distributed.")

    # ── Homoscedasticity ─────────────────────────────────────────────────────
    with acol2:
        st.markdown("**Homoscedasticity (Breusch-Pagan)**")
        try:
            bp_lm, bp_p, bp_f, bp_fp = het_breuschpagan(resid, model.model.exog)
            if bp_p > 0.05:
                _badge("Breusch-Pagan", f"LM = {bp_lm:.3f},  p = {bp_p:.4f}", "ok",
                       "Error variance appears constant (homoscedastic).")
            else:
                _badge("Breusch-Pagan", f"LM = {bp_lm:.3f},  p = {bp_p:.4f}", "fail",
                       "Heteroscedasticity detected — SEs may be unreliable.")
        except Exception as e:
            st.warning(f"Breusch-Pagan test failed: {e}")

    bcol1, bcol2 = st.columns(2)

    # ── Independence / No autocorrelation ────────────────────────────────────
    with bcol1:
        st.markdown("**Independence of Errors (Durbin-Watson)**")
        dw_stat = durbin_watson(resid)
        if 1.5 < dw_stat < 2.5:
            _badge("Durbin-Watson", f"DW = {dw_stat:.4f}", "ok",
                   "No significant autocorrelation detected (target ≈ 2.0).")
        elif dw_stat <= 1.5:
            _badge("Durbin-Watson", f"DW = {dw_stat:.4f}", "warn",
                   "Positive autocorrelation suspected — consider lagged terms.")
        else:
            _badge("Durbin-Watson", f"DW = {dw_stat:.4f}", "warn",
                   "Negative autocorrelation suspected.")

    # ── Stationarity (ADF) per predictor ─────────────────────────────────────
    with bcol2:
        st.markdown("**Stationarity (ADF Test per Variable)**")
        all_stationary = True
        for col in x_cols:
            series = df_work[col].dropna()
            if len(series) < 8:
                continue
            try:
                adf_stat, adf_p, *_ = adfuller(series, autolag="AIC")
                status = "ok" if adf_p < 0.05 else "warn"
                if status == "warn":
                    all_stationary = False
                _badge(
                    label_opts[col],
                    f"ADF = {adf_stat:.3f},  p = {adf_p:.4f}",
                    status,
                    "Stationary." if adf_p < 0.05 else "Non-stationary — consider differencing.",
                )
            except Exception:
                pass
        if all_stationary:
            st.caption("All predictors appear stationary.")

    # ── Multicollinearity (VIF) ───────────────────────────────────────────────
    st.markdown("**Multicollinearity (VIF)**")
    if n_pred > 1:
        try:
            vif_vals = [variance_inflation_factor(X.values, i + 1) for i in range(n_pred)]
            vif_df   = pd.DataFrame({
                "Variable": [label_opts[c] for c in x_cols],
                "VIF":      [round(v, 2) for v in vif_vals],
                "Status":   ["OK" if v < 5 else ("Moderate" if v < 10 else "HIGH") for v in vif_vals],
            })
            st.dataframe(vif_df, use_container_width=True, hide_index=True)
            if any(v >= 10 for v in vif_vals):
                st.warning("VIF ≥ 10 indicates severe multicollinearity. Consider removing correlated predictors.")
            elif any(v >= 5 for v in vif_vals):
                st.info("VIF 5–10 indicates moderate multicollinearity.")
        except Exception as e:
            st.warning(f"VIF calculation failed: {e}")
    else:
        st.info("VIF requires at least 2 predictors.")

    # ── Section 4: Diagnostic Plots ───────────────────────────────────────────
    st.divider()
    st.subheader("Diagnostic Plots")

    diag_c1, diag_c2 = st.columns(2)

    # Residuals vs Fitted
    with diag_c1:
        fig_rv = go.Figure()
        fig_rv.add_trace(go.Scatter(
            x=fitted, y=resid, mode="markers",
            marker=dict(color="steelblue", opacity=0.7, size=7),
            name="Residual",
        ))
        fig_rv.add_hline(y=0, line_dash="dash", line_color="red", line_width=1)
        fig_rv.update_layout(
            title="Residuals vs Fitted",
            xaxis_title="Fitted Values",
            yaxis_title="Residuals",
            height=350,
        )
        st.plotly_chart(fig_rv, use_container_width=True)

    # Q-Q Plot
    with diag_c2:
        qq = probplot(resid, dist="norm")
        qq_theoretical, qq_sample = qq[0]
        fig_qq = go.Figure()
        fig_qq.add_trace(go.Scatter(
            x=qq_theoretical, y=qq_sample, mode="markers",
            marker=dict(color="steelblue", opacity=0.7, size=7),
            name="Quantiles",
        ))
        # Reference line
        mn = min(qq_theoretical[0], qq_sample[0])
        mx = max(qq_theoretical[-1], qq_sample[-1])
        fig_qq.add_trace(go.Scatter(
            x=[mn, mx], y=[mn, mx], mode="lines",
            line=dict(color="red", dash="dash"), name="Normal",
        ))
        fig_qq.update_layout(
            title="Normal Q-Q Plot",
            xaxis_title="Theoretical Quantiles",
            yaxis_title="Sample Quantiles",
            height=350,
        )
        st.plotly_chart(fig_qq, use_container_width=True)

    diag_c3, diag_c4 = st.columns(2)

    # Scale-Location (sqrt |standardized residuals| vs fitted)
    with diag_c3:
        std_resid   = resid / resid.std()
        sqrt_absres = np.sqrt(np.abs(std_resid))
        fig_sl = go.Figure()
        fig_sl.add_trace(go.Scatter(
            x=fitted, y=sqrt_absres, mode="markers",
            marker=dict(color="steelblue", opacity=0.7, size=7),
        ))
        # Lowess smoother approximation (rolling mean as proxy)
        sl_df = pd.DataFrame({"x": fitted, "y": sqrt_absres}).sort_values("x")
        sl_smooth = sl_df["y"].rolling(max(3, n_obs // 10), center=True, min_periods=1).mean()
        fig_sl.add_trace(go.Scatter(
            x=sl_df["x"].values, y=sl_smooth.values, mode="lines",
            line=dict(color="red", width=2), name="Smooth",
        ))
        fig_sl.update_layout(
            title="Scale-Location",
            xaxis_title="Fitted Values",
            yaxis_title="√|Standardized Residuals|",
            height=350, showlegend=False,
        )
        st.plotly_chart(fig_sl, use_container_width=True)

    # Cook's Distance
    with diag_c4:
        try:
            influence  = OLSInfluence(model)
            cooks_d, _ = influence.cooks_distance
            threshold  = 4 / n_obs
            colors_cd  = ["#e74c3c" if c > threshold else "steelblue" for c in cooks_d]
            fig_cd = go.Figure()
            fig_cd.add_trace(go.Bar(
                x=list(range(n_obs)), y=cooks_d,
                marker_color=colors_cd, name="Cook's D",
            ))
            fig_cd.add_hline(
                y=threshold, line_dash="dash", line_color="red", line_width=1,
            )
            fig_cd.update_layout(
                title=f"Cook's Distance  (threshold = 4/n = {threshold:.3f})",
                xaxis_title="Observation Index",
                yaxis_title="Cook's D",
                height=350, showlegend=False,
            )
            st.plotly_chart(fig_cd, use_container_width=True)
        except Exception as e:
            st.warning(f"Cook's Distance unavailable: {e}")

    # ── Residuals over time ───────────────────────────────────────────────────
    st.divider()
    st.subheader("Residuals Over Time")
    st.caption("Patterns here suggest autocorrelation or regime changes across the season.")

    fig_rt = go.Figure()
    fig_rt.add_trace(go.Scatter(
        x=df_work["game_date"].values, y=resid, mode="lines+markers",
        marker=dict(color="steelblue", size=6),
        line=dict(width=1.5),
    ))
    fig_rt.add_hline(y=0, line_dash="dash", line_color="red", line_width=1)
    # Mark target game
    if str(target_date) in df_work["game_date"].values:
        fig_rt.add_shape(
            type="line",
            x0=str(target_date), x1=str(target_date),
            y0=0, y1=1, xref="x", yref="paper",
            line=dict(dash="dash", color="orange", width=2),
        )
        fig_rt.add_annotation(
            x=str(target_date), y=1, xref="x", yref="paper",
            text="Target game", showarrow=False,
            xanchor="left", font=dict(color="orange", size=10),
        )
    fig_rt.update_layout(
        xaxis_title="Game Date", yaxis_title="Residual", height=320,
    )
    st.plotly_chart(fig_rt, use_container_width=True)

    # ── Correlation heatmap of predictors ─────────────────────────────────────
    if n_pred > 1:
        st.divider()
        st.subheader("Predictor Correlation Matrix")
        corr_mat = X_raw.corr().round(2)
        corr_mat.columns = [label_opts[c] for c in corr_mat.columns]
        corr_mat.index   = corr_mat.columns
        fig_hm = px.imshow(
            corr_mat, text_auto=True, color_continuous_scale="RdBu_r",
            zmin=-1, zmax=1,
            title="Pearson Correlation — Predictors",
        )
        fig_hm.update_layout(height=max(300, 50 * n_pred))
        st.plotly_chart(fig_hm, use_container_width=True)

    # ── Raw regression data ───────────────────────────────────────────────────
    with st.expander("Raw Regression Data"):
        display_reg = df_work.copy()
        display_reg.insert(2, "__fitted__", fitted.round(3))
        display_reg.insert(3, "__residual__", resid.round(3))
        st.dataframe(display_reg, use_container_width=True)
