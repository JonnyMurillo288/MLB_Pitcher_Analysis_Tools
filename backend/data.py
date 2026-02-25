"""Data fetching layer — wraps pybaseball calls with the global TTL cache."""

import warnings
from datetime import date, timedelta

import numpy as np
import pandas as pd
from pybaseball import pitching_stats, playerid_lookup, playerid_reverse_lookup, statcast_pitcher

from cache import PITCHER_CACHE, SEASON_CACHE

warnings.filterwarnings("ignore")

TODAY = date.today()
AVAILABLE_SEASONS = [y for y in [2021, 2022, 2023, 2024, 2025] if y <= TODAY.year]


# ── Pitcher list ──────────────────────────────────────────────────────────────

def load_qualified_pitchers() -> pd.DataFrame:
    cached = PITCHER_CACHE.get("pitchers")
    if cached is not None:
        return cached

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
        return pd.DataFrame(columns=["Name", "Team", "IP", "G", "GS", "gs_pct", "_season"])

    combined = pd.concat(all_dfs, ignore_index=True)
    combined["IP"]  = pd.to_numeric(combined["IP"],  errors="coerce").fillna(0)
    combined["G"]   = pd.to_numeric(combined["G"],   errors="coerce").fillna(0)
    combined["GS"]  = pd.to_numeric(combined["GS"],  errors="coerce").fillna(0)
    combined["gs_pct"] = combined["GS"] / combined["G"].replace(0, np.nan)

    qualified = combined[
        (combined["G"] >= 5) &
        ((combined["IP"] > 100) | (combined["gs_pct"] > 0.70))
    ].copy()

    qualified = (
        qualified
        .sort_values("_season", ascending=False)
        .drop_duplicates("Name", keep="first")
        .sort_values("Name")
        .reset_index(drop=True)
    )
    result = qualified[["IDfg", "Name", "Team", "IP", "G", "GS", "gs_pct", "_season"]]
    PITCHER_CACHE.set("pitchers", result)
    return result


# ── Pitcher ID ────────────────────────────────────────────────────────────────

def resolve_mlbam_id_from_idfg(idfg: int) -> int | None:
    cache_key = f"id_idfg::{idfg}"
    cached = PITCHER_CACHE.get(cache_key)
    if cached is not None:
        return cached

    res = playerid_reverse_lookup([idfg], key_type="fangraphs")
    if res.empty:
        return None
    rows = res[res["mlb_played_last"].notna()]
    if rows.empty:
        rows = res
    pid = int(rows.sort_values("mlb_played_last", ascending=False).iloc[0]["key_mlbam"])
    PITCHER_CACHE.set(cache_key, pid)
    return pid


def resolve_mlbam_id(full_name: str) -> int | None:
    cache_key = f"id::{full_name}"
    cached = PITCHER_CACHE.get(cache_key)
    if cached is not None:
        return cached

    # Try IDfg-based lookup first (more reliable than name matching)
    pitchers_df = load_qualified_pitchers()
    if not pitchers_df.empty and "IDfg" in pitchers_df.columns:
        match = pitchers_df[pitchers_df["Name"] == full_name]
        if not match.empty:
            idfg = int(match.iloc[0]["IDfg"])
            pid = resolve_mlbam_id_from_idfg(idfg)
            if pid is not None:
                PITCHER_CACHE.set(cache_key, pid)
                return pid

    # Fallback: name-based lookup
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
    pid = int(rows.sort_values("mlb_played_last", ascending=False).iloc[0]["key_mlbam"])
    PITCHER_CACHE.set(cache_key, pid)
    return pid


# ── Season data ───────────────────────────────────────────────────────────────

def load_season(pid: int, year: int) -> pd.DataFrame:
    cache_key = f"season::{pid}::{year}"
    cached = SEASON_CACHE.get(cache_key)
    if cached is not None:
        return cached

    end_dt = TODAY if year == TODAY.year else date(year, 11, 30)
    df = statcast_pitcher(f"{year}-03-01", end_dt.strftime("%Y-%m-%d"), pid)
    if df is None or df.empty:
        return pd.DataFrame()

    df["game_date"] = pd.to_datetime(df["game_date"]).dt.date
    SEASON_CACHE.set(cache_key, df)
    return df


# ── Trend dataset builder ─────────────────────────────────────────────────────

def build_trend_df(
    season_df: pd.DataFrame,
    target_date: date,
    trend_type: str,
    n_days: int | None,
    trend_season: int | None,
    pid: int,
) -> pd.DataFrame:
    if trend_type == "rolling":
        cutoff = target_date - timedelta(days=(n_days or 30))
        sub = season_df[
            (season_df["game_date"] >= cutoff) &
            (season_df["game_date"] < target_date)
        ]
        return sub if not sub.empty else pd.DataFrame()
    else:
        yr = trend_season or (target_date.year - 1)
        yr_df = load_season(pid, yr)
        if yr_df.empty:
            return pd.DataFrame()
        return yr_df[yr_df["game_date"] != target_date]
