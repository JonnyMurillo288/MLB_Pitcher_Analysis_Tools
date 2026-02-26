import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTableView } from "../../api/client";
import type { TableViewRow, TableStatMeta, TrendSignals } from "../../types";

interface Props {
  pitcherId: number;
  season: number;
}

const AVAILABLE_SEASONS = [2021, 2022, 2023, 2024, 2025];
const GROUP_ORDER = ["Pitch Arsenal", "Mechanics", "Control", "Results"];
const WINDOW_PRESETS = [7, 14, 30, 60];

const SIGNAL_LABELS: Record<string, string> = {
  release_speed: "Velocity",
  k_per_9:       "K/9",
  bb_per_9:      "BB/9",
  whiff_pct:     "Whiff%",
  exit_velo:     "Exit Velo",
};

// higher_is_better for arrow coloring
const SIGNAL_HIB: Record<string, boolean> = {
  release_speed: true,
  k_per_9:       true,
  bb_per_9:      false,
  whiff_pct:     true,
  exit_velo:     false,
};

function fmtVal(v: number | null, unit: string): string {
  if (v == null || isNaN(v)) return "—";
  if (unit === "%") return v.toFixed(1) + "%";
  if (unit === "mph") return v.toFixed(1);
  if (unit === "rpm") return Math.round(v).toString();
  if (unit === "°") return Math.round(v).toString() + "°";
  return v.toFixed(2);
}

function fmtDelta(v: number | null, unit: string): string {
  if (v == null || isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  if (unit === "%") return sign + v.toFixed(1) + "%";
  if (unit === "mph") return sign + v.toFixed(1);
  if (unit === "rpm") return sign + Math.round(v).toString();
  if (unit === "°") return sign + Math.round(v).toString() + "°";
  return sign + v.toFixed(2);
}

function deltaColor(row: TableViewRow): string {
  if (row.delta == null || row.higher_is_better == null) return "text-gray-400";
  const good = row.delta > 0 ? row.higher_is_better : !row.higher_is_better;
  const big  = row.delta_pct != null && Math.abs(row.delta_pct) > 5;
  if (good) return big ? "text-green-300 font-semibold" : "text-green-500";
  return big ? "text-red-300 font-semibold" : "text-red-500";
}

function SignalBadges({ signals }: { signals: TrendSignals }) {
  const badges: React.ReactNode[] = [];

  if (signals.breakout) {
    badges.push(
      <span key="breakout" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-900/50 text-yellow-300 border border-yellow-700/40">
        ⚡ Breakout — velocity, whiff%, and K/9 all trending up
      </span>
    );
  }

  if (signals.divergence) {
    badges.push(
      <span key="divergence" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-300 border border-red-700/40">
        ⚠ Divergence — velocity down, walk rate up
      </span>
    );
  }

  if (signals.pitch_mix_shift) {
    badges.push(
      <span key="mix" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-900/50 text-blue-300 border border-blue-700/40">
        🔄 Pitch mix shift — {signals.shifted_pitches.join(", ")}
      </span>
    );
  }

  // Per-stat arrows (skip stats covered by the composite badges above)
  for (const [stat, dir] of Object.entries(signals.arrows)) {
    const label = SIGNAL_LABELS[stat];
    if (!label) continue;
    const hib   = SIGNAL_HIB[stat];
    const good  = dir === "up" ? hib : !hib;
    const arrow = dir === "up" ? "↑" : "↓";
    badges.push(
      <span
        key={stat}
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs border ${
          good
            ? "bg-green-900/40 text-green-300 border-green-700/40"
            : "bg-red-900/40 text-red-300 border-red-700/40"
        }`}
      >
        {arrow} {label}
      </span>
    );
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges}
    </div>
  );
}

export default function TableView({ pitcherId, season }: Props) {
  const [localSeason, setLocalSeason] = useState(season);
  const [nDaysInput, setNDaysInput] = useState("30");
  const [nDays, setNDays] = useState(30);
  const [selectedStats, setSelectedStats] = useState<Set<string> | null>(null);

  // sync season from sidebar
  useEffect(() => { setLocalSeason(season); }, [season]);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["table-view", pitcherId, localSeason, nDays],
    queryFn: () => getTableView({ pitcher_id: pitcherId, season: localSeason, n_days: nDays }),
    enabled: pitcherId > 0,
  });

  // default to all stats selected on first load
  useEffect(() => {
    if (data && selectedStats === null) {
      setSelectedStats(new Set(data.available_stats.map((s) => s.key)));
    }
  }, [data]);

  if (pitcherId === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        Select a pitcher from the sidebar.
      </div>
    );
  }

  // build group → stat meta lookup
  const byGroup: Record<string, TableStatMeta[]> = {};
  if (data) {
    for (const s of data.available_stats) {
      if (!byGroup[s.group]) byGroup[s.group] = [];
      byGroup[s.group].push(s);
    }
  }

  // filter rows to selected stats, then re-group
  const visibleRows = data
    ? data.rows.filter((r) => !selectedStats || selectedStats.has(r.stat))
    : [];
  const rowsByGroup: Record<string, TableViewRow[]> = {};
  for (const r of visibleRows) {
    if (!rowsByGroup[r.group]) rowsByGroup[r.group] = [];
    rowsByGroup[r.group].push(r);
  }

  function toggleStat(key: string) {
    setSelectedStats((prev) => {
      const base = prev ?? new Set(data?.available_stats.map((s) => s.key) ?? []);
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: string, stats: TableStatMeta[]) {
    setSelectedStats((prev) => {
      const base = prev ?? new Set(data?.available_stats.map((s) => s.key) ?? []);
      const next = new Set(base);
      const keys = stats.map((s) => s.key);
      const allOn = keys.every((k) => next.has(k));
      if (allOn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  function commitNDays(value?: number) {
    const v = value ?? parseInt(nDaysInput, 10);
    if (!isNaN(v) && v > 0) {
      setNDays(v);
      setNDaysInput(String(v));
    } else {
      setNDaysInput(String(nDays));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="card flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Season</label>
          <select
            className="bg-surface-border text-gray-200 text-sm rounded px-2 py-1"
            value={localSeason}
            onChange={(e) => setLocalSeason(Number(e.target.value))}
          >
            {AVAILABLE_SEASONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Rolling window (days)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              className="bg-surface-border text-gray-200 text-sm rounded px-2 py-1 w-16"
              value={nDaysInput}
              onChange={(e) => setNDaysInput(e.target.value)}
              onBlur={() => commitNDays()}
              onKeyDown={(e) => e.key === "Enter" && commitNDays()}
            />
            <div className="flex gap-1">
              {WINDOW_PRESETS.map((d) => (
                <button
                  key={d}
                  className={`text-xs px-2 py-1 rounded ${
                    nDays === d
                      ? "bg-brand text-white"
                      : "bg-surface-border text-gray-400 hover:text-gray-200"
                  }`}
                  onClick={() => commitNDays(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {isFetching && (
          <span className="text-xs text-gray-400 animate-pulse self-end pb-1">
            Loading…
          </span>
        )}
      </div>

      {/* ── Date / game metadata ──────────────────────────────────────────── */}
      {data && (
        <div className="flex flex-wrap gap-6 text-xs text-gray-400">
          <span>
            <span className="text-gray-300 font-medium">Season:</span>{" "}
            {data.season_start} → {data.season_end}{" "}
            <span className="text-gray-500">({data.n_games_season} games)</span>
          </span>
          {data.rolling_start ? (
            <span>
              <span className="text-gray-300 font-medium">Rolling ({nDays}d):</span>{" "}
              {data.rolling_start} → {data.rolling_end}{" "}
              <span className="text-gray-500">({data.n_games_rolling} games)</span>
            </span>
          ) : (
            <span className="text-yellow-600">No games in rolling window.</span>
          )}
        </div>
      )}

      {/* ── Signal badges ─────────────────────────────────────────────────── */}
      {data?.signals && (
        <SignalBadges signals={data.signals} />
      )}

      {/* ── Stat group / stat toggles ─────────────────────────────────────── */}
      {data && (
        <div className="flex flex-wrap gap-5">
          {GROUP_ORDER.filter((g) => byGroup[g]).map((group) => {
            const stats = byGroup[group];
            const allOn = stats.every((s) => selectedStats?.has(s.key) ?? true);
            return (
              <div key={group} className="flex flex-col gap-1.5">
                <button
                  className={`text-xs font-semibold px-2 py-0.5 rounded self-start ${
                    allOn ? "bg-brand text-white" : "bg-surface-border text-gray-400"
                  }`}
                  onClick={() => toggleGroup(group, stats)}
                >
                  {group}
                </button>
                <div className="flex flex-wrap gap-1">
                  {stats.map((s) => {
                    const on = selectedStats?.has(s.key) ?? true;
                    return (
                      <button
                        key={s.key}
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          on ? "bg-gray-700 text-gray-200" : "bg-surface-border text-gray-500"
                        }`}
                        onClick={() => toggleStat(s.key)}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {isError && (
        <div className="text-red-400 text-sm p-4 card">
          Error loading data: {(error as Error).message}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {data && (
        <div className="flex flex-col gap-8">
          {GROUP_ORDER.filter((g) => rowsByGroup[g]?.length).map((group) => (
            <div key={group}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {group}
              </h3>
              <div className="overflow-x-auto card p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border text-xs text-gray-400">
                      <th className="text-left px-3 py-2">Stat</th>
                      <th className="text-right px-3 py-2">Season Avg</th>
                      <th className="text-right px-3 py-2">Last {nDays}d Avg</th>
                      <th className="text-right px-3 py-2">Delta</th>
                      <th className="text-right px-3 py-2">Δ%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsByGroup[group].map((row) => {
                      const dc = deltaColor(row);
                      return (
                        <tr
                          key={row.stat}
                          className="border-b border-surface-border/40 hover:bg-surface-border/20"
                        >
                          <td className="px-3 py-2 text-gray-200 font-medium whitespace-nowrap">
                            {row.label}
                            {row.unit && (
                              <span className="text-gray-500 text-xs ml-1">({row.unit})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-300">
                            {fmtVal(row.season_avg, row.unit)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-300">
                            {fmtVal(row.rolling_avg, row.unit)}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${dc}`}>
                            {fmtDelta(row.delta, row.unit)}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono text-xs ${dc}`}>
                            {row.delta_pct != null
                              ? (row.delta_pct > 0 ? "+" : "") + row.delta_pct.toFixed(1) + "%"
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
