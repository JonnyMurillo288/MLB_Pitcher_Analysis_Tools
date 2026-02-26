import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLeagueTable, getSavedPitchers, savePitcher, deleteSavedPitcher } from "../../api/client";
import type { LeaguePitcherRow, TableStatMeta, TrendSignals } from "../../types";
import { useAuth } from "../../contexts/AuthContext";

const AVAILABLE_SEASONS = [2021, 2022, 2023, 2024, 2025];
const GROUP_ORDER = ["Pitch Arsenal", "Mechanics", "Control", "Results"];
const DEFAULT_STATS = new Set(["release_speed", "k_per_9", "whiff_pct", "exit_velo"]);

function fmtVal(v: number | null, unit: string): string {
  if (v == null || isNaN(v)) return "—";
  if (unit === "%") return v.toFixed(1) + "%";
  if (unit === "mph") return v.toFixed(1);
  if (unit === "rpm") return Math.round(v).toString();
  if (unit === "°") return Math.round(v).toString();
  return v.toFixed(2);
}

function fmtDelta(v: number | null, unit: string): string {
  if (v == null || isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  if (unit === "%") return sign + v.toFixed(1) + "%";
  if (unit === "mph") return sign + v.toFixed(1);
  if (unit === "rpm") return sign + Math.round(v).toString();
  return sign + v.toFixed(2);
}

type SortDir = "asc" | "desc";
interface SortState { col: string; dir: SortDir }

const HIB_MAP: Record<string, boolean> = {
  release_speed: true, effective_speed: true, release_spin_rate: true,
  release_extension: true, k_per_9: true, whiff_pct: true, swstr_pct: true,
  chase_pct: true, gb_pct: true, fps_pct: true, iz_whiff_pct: true,
  oz_whiff_pct: true, two_strike_whiff_pct: true,
  exit_velo: false, fb_pct: false, bb_per_9: false,
  hhr_pct: false, barrel_pct: false, rp_consistency: false,
};

function deltaClass(delta: number | null, deltaPct: number | null, statKey: string): string {
  if (delta == null) return "text-gray-400";
  const hib = HIB_MAP[statKey];
  if (hib == null) return "text-gray-400";
  const good = delta > 0 ? hib : !hib;
  const big  = deltaPct != null && Math.abs(deltaPct) > 5;
  if (good) return big ? "text-green-300 font-semibold" : "text-green-500";
  return big ? "text-red-300 font-semibold" : "text-red-500";
}

function SignalIcons({ signals }: { signals: TrendSignals }) {
  const parts: string[] = [];
  if (signals.breakout)        parts.push("⚡");
  if (signals.divergence)      parts.push("⚠");
  if (signals.pitch_mix_shift) parts.push("🔄");
  for (const [, dir] of Object.entries(signals.arrows)) {
    if (dir === "up")   parts.push("↑");
    else                parts.push("↓");
    break; // show at most one stat arrow; composite badges cover multi-stat
  }
  if (parts.length === 0) return <span className="text-gray-600">—</span>;
  return (
    <span title={[
      signals.breakout        ? "Breakout: velo+whiff+K/9 all up"   : "",
      signals.divergence      ? "Divergence: velo down, walks up"   : "",
      signals.pitch_mix_shift ? `Pitch mix shift: ${signals.shifted_pitches.join(",")}` : "",
      ...Object.entries(signals.arrows).map(([s, d]) => `${s} ${d}`),
    ].filter(Boolean).join(" · ")}>
      {parts.join(" ")}
    </span>
  );
}

function SortIcon({ col, sortState }: { col: string; sortState: SortState | null }) {
  if (sortState?.col !== col) return <span className="text-gray-600 ml-0.5 text-xs">⇅</span>;
  return <span className="text-blue-400 ml-0.5 text-xs">{sortState.dir === "asc" ? "↑" : "↓"}</span>;
}

export default function LeagueTable() {
  const { user, getToken } = useAuth();
  const qc = useQueryClient();

  const [localSeason, setLocalSeason] = useState(2025);
  const [nDaysInput, setNDaysInput]   = useState("30");
  const [nDays, setNDays]             = useState(30);
  const [selectedStats, setSelectedStats] = useState<Set<string>>(DEFAULT_STATS);
  const [sortState, setSortState]     = useState<SortState | null>({ col: "name", dir: "asc" });
  const [teamFilter, setTeamFilter]   = useState<string>("");

  const [committed, setCommitted] = useState<{
    season: number; nDays: number; loadAll: boolean;
  } | null>(null);

  // Saved pitchers (for pinning + star toggle)
  const { data: savedPitchers = [] } = useQuery({
    queryKey: ["saved-pitchers"],
    queryFn: () => getSavedPitchers(getToken),
    enabled: !!user,
  });
  const savedNames = useMemo(
    () => new Set(savedPitchers.map((p) => p.pitcher_name)),
    [savedPitchers]
  );
  const saveMut = useMutation({
    mutationFn: (name: string) => savePitcher(getToken, name, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-pitchers"] }),
  });
  const removeMut = useMutation({
    mutationFn: (name: string) => deleteSavedPitcher(getToken, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-pitchers"] }),
  });

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["league-table", committed?.season, committed?.nDays, committed?.loadAll],
    queryFn: () => getLeagueTable({
      season: committed!.season,
      n_days: committed!.nDays,
      load_all: committed!.loadAll,
    }),
    enabled: committed !== null,
  });

  function commitNDays() {
    const v = parseInt(nDaysInput, 10);
    if (!isNaN(v) && v > 0) setNDays(v);
    else setNDaysInput(String(nDays));
  }

  function load(loadAll: boolean) {
    const days = parseInt(nDaysInput, 10);
    const finalDays = !isNaN(days) && days > 0 ? days : nDays;
    setNDays(finalDays);
    setCommitted({ season: localSeason, nDays: finalDays, loadAll });
  }

  function handleSort(col: string) {
    setSortState((prev) =>
      prev?.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );
  }

  // Group → stat meta
  const byGroup = useMemo<Record<string, TableStatMeta[]>>(() => {
    if (!data) return {};
    const out: Record<string, TableStatMeta[]> = {};
    for (const s of data.available_stats) {
      if (!out[s.group]) out[s.group] = [];
      out[s.group].push(s);
    }
    return out;
  }, [data]);

  const visibleStats = useMemo<TableStatMeta[]>(() => {
    if (!data) return [];
    return data.available_stats.filter((s) => selectedStats.has(s.key));
  }, [data, selectedStats]);

  // Unique teams for filter dropdown
  const teams = useMemo<string[]>(() => {
    if (!data) return [];
    return [...new Set(data.pitchers.map((p) => p.team).filter(Boolean))].sort();
  }, [data]);

  // Sort + pin watched pitchers to top
  const sortedPitchers = useMemo<LeaguePitcherRow[]>(() => {
    if (!data) return [];
    let rows = [...data.pitchers];

    // Apply team filter
    if (teamFilter) rows = rows.filter((p) => p.team === teamFilter);

    if (sortState) {
      const { col, dir } = sortState;
      const mult = dir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        let av: number | string | null;
        let bv: number | string | null;
        if      (col === "name")             { av = a.name;            bv = b.name; }
        else if (col === "team")             { av = a.team;            bv = b.team; }
        else if (col === "ip")               { av = a.ip;              bv = b.ip; }
        else if (col === "n_games_season")   { av = a.n_games_season;  bv = b.n_games_season; }
        else if (col === "n_games_rolling")  { av = a.n_games_rolling; bv = b.n_games_rolling; }
        else {
          const [statKey, subCol] = col.split(".");
          av = a.stats[statKey]?.[subCol as keyof typeof a.stats[string]] ?? null;
          bv = b.stats[statKey]?.[subCol as keyof typeof b.stats[string]] ?? null;
        }
        if (av == null && bv == null) return 0;
        if (av == null) return mult;
        if (bv == null) return -mult;
        if (typeof av === "string") return mult * av.localeCompare(bv as string);
        return mult * ((av as number) - (bv as number));
      });
    }

    // Pin watched pitchers to top (only when logged in)
    if (user && savedNames.size > 0) {
      const pinned   = rows.filter((p) => savedNames.has(p.name));
      const unpinned = rows.filter((p) => !savedNames.has(p.name));
      return [...pinned, ...unpinned];
    }
    return rows;
  }, [data, sortState, teamFilter, savedNames, user]);

  const hasPinned = user && sortedPitchers.some((p) => savedNames.has(p.name));
  const firstUnpinnedIdx = hasPinned
    ? sortedPitchers.findIndex((p) => !savedNames.has(p.name))
    : -1;

  function toggleStat(key: string) {
    setSelectedStats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: string, stats: TableStatMeta[]) {
    setSelectedStats((prev) => {
      const next = new Set(prev);
      const keys = stats.map((s) => s.key);
      const allOn = keys.every((k) => next.has(k));
      if (allOn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  function downloadCSV() {
    if (!data || sortedPitchers.length === 0) return;
    const fixedHeaders = ["Name", "Team", "IP", "Games (season)", `Games (${nDays}d)`];
    const statHeaders  = visibleStats.flatMap((s) => [
      `${s.label} Season`, `${s.label} ${nDays}d`, `${s.label} Δ`,
    ]);
    const header = [...fixedHeaders, ...statHeaders].join(",");

    const rows = sortedPitchers.map((p) => {
      const fixed = [
        `"${p.name}"`, p.team || "", p.ip.toFixed(1),
        p.n_games_season, p.n_games_rolling,
      ];
      const stats = visibleStats.flatMap((s) => {
        const st = p.stats[s.key];
        return [st?.season_avg ?? "", st?.rolling_avg ?? "", st?.delta ?? ""];
      });
      return [...fixed, ...stats].join(",");
    });

    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `league_table_${data.season}_${data.rolling_window}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Controls ──────────────────────────────────────────────────────── */}
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
          <input
            type="number" min={1} max={365}
            className="bg-surface-border text-gray-200 text-sm rounded px-2 py-1 w-20"
            value={nDaysInput}
            onChange={(e) => setNDaysInput(e.target.value)}
            onBlur={commitNDays}
            onKeyDown={(e) => e.key === "Enter" && commitNDays()}
          />
        </div>

        {teams.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Team filter</label>
            <select
              className="bg-surface-border text-gray-200 text-sm rounded px-2 py-1"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-2 self-end">
          <button
            className="text-xs bg-surface-border text-gray-200 px-3 py-1.5 rounded hover:bg-gray-600 disabled:opacity-50"
            disabled={isFetching}
            onClick={() => load(false)}
          >
            {isFetching && !committed?.loadAll ? "Loading…" : "Load Cached"}
          </button>
          <button
            className="text-xs bg-brand text-white px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50"
            disabled={isFetching}
            onClick={() => load(true)}
          >
            {isFetching && committed?.loadAll ? "Loading all…" : "Load All Pitchers"}
          </button>
          {data && sortedPitchers.length > 0 && (
            <button
              className="text-xs bg-surface-border text-gray-300 px-3 py-1.5 rounded hover:bg-gray-600"
              onClick={downloadCSV}
            >
              ↓ CSV
            </button>
          )}
        </div>

        {isFetching && (
          <span className="text-xs text-gray-400 animate-pulse self-end pb-1">
            {committed?.loadAll
              ? "Fetching all pitcher data — this may take a minute…"
              : "Loading cached pitchers…"}
          </span>
        )}
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      {data && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <span>
            <span className="text-gray-300 font-medium">{data.n_pitchers_loaded}</span>
            {" of "}
            <span className="text-gray-300 font-medium">{data.n_pitchers_total}</span>
            {" pitchers loaded"}
            {data.n_pitchers_loaded < data.n_pitchers_total && (
              <span className="text-yellow-500 ml-2">
                — click "Load All Pitchers" to fetch remaining
              </span>
            )}
          </span>
          <span>Rolling: {data.rolling_window}d window · Season: {data.season}</span>
          {teamFilter && (
            <span className="text-blue-400">
              Filtered: {teamFilter}{" "}
              <button className="underline" onClick={() => setTeamFilter("")}>clear</button>
            </span>
          )}
        </div>
      )}

      {/* ── Stat toggles ──────────────────────────────────────────────────── */}
      {data && (
        <div className="flex flex-wrap gap-5">
          {GROUP_ORDER.filter((g) => byGroup[g]).map((group) => {
            const stats = byGroup[group];
            const allOn = stats.every((s) => selectedStats.has(s.key));
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
                  {stats.map((s) => (
                    <button
                      key={s.key}
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        selectedStats.has(s.key)
                          ? "bg-gray-700 text-gray-200"
                          : "bg-surface-border text-gray-500"
                      }`}
                      onClick={() => toggleStat(s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {isError && (
        <div className="text-red-400 text-sm p-4 card">
          Error: {(error as Error).message}
        </div>
      )}

      {!data && !isFetching && (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
          Click "Load Cached" to see pitchers already in cache, or "Load All Pitchers" to fetch everyone.
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {data && sortedPitchers.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-8">
          No pitcher data in cache. Click "Load All Pitchers" to fetch.
        </div>
      )}

      {data && sortedPitchers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-sm w-full min-w-max">
            <thead>
              <tr className="border-b border-surface-border text-xs text-gray-400">
                {user && (
                  <th rowSpan={2} className="px-2 py-2 align-bottom w-6" />
                )}
                <th rowSpan={2}
                  className="text-left px-3 py-2 cursor-pointer whitespace-nowrap hover:text-gray-200 align-bottom"
                  onClick={() => handleSort("name")}
                >
                  Player <SortIcon col="name" sortState={sortState} />
                </th>
                <th rowSpan={2}
                  className="text-left px-3 py-2 cursor-pointer whitespace-nowrap hover:text-gray-200 align-bottom"
                  onClick={() => handleSort("team")}
                >
                  Team <SortIcon col="team" sortState={sortState} />
                </th>
                <th rowSpan={2}
                  className="text-right px-3 py-2 cursor-pointer whitespace-nowrap hover:text-gray-200 align-bottom"
                  onClick={() => handleSort("ip")}
                >
                  IP <SortIcon col="ip" sortState={sortState} />
                </th>
                <th rowSpan={2}
                  className="text-right px-3 py-2 cursor-pointer whitespace-nowrap hover:text-gray-200 align-bottom"
                  onClick={() => handleSort("n_games_season")}
                >
                  Gs <SortIcon col="n_games_season" sortState={sortState} />
                </th>
                <th rowSpan={2}
                  className="text-right px-3 py-2 cursor-pointer whitespace-nowrap hover:text-gray-200 align-bottom border-r border-surface-border"
                  onClick={() => handleSort("n_games_rolling")}
                >
                  Gs({nDays}d) <SortIcon col="n_games_rolling" sortState={sortState} />
                </th>
                <th rowSpan={2}
                  className="text-center px-2 py-2 whitespace-nowrap align-bottom border-r border-surface-border text-gray-500"
                  title="Trend signals: ⚡ breakout · ⚠ divergence · 🔄 pitch mix shift · ↑↓ stat arrows"
                >
                  Signals
                </th>
                {visibleStats.map((s) => (
                  <th
                    key={s.key}
                    colSpan={3}
                    className="text-center px-3 py-1.5 border-l border-surface-border font-semibold text-gray-300"
                  >
                    {s.label}
                    {s.unit && <span className="text-gray-500 font-normal ml-1">({s.unit})</span>}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-surface-border text-xs text-gray-500">
                {visibleStats.map((s) => (
                  <>
                    <th key={`${s.key}.season_avg`}
                      className="text-right px-2 py-1 cursor-pointer hover:text-gray-300 border-l border-surface-border whitespace-nowrap"
                      onClick={() => handleSort(`${s.key}.season_avg`)}
                    >
                      Season <SortIcon col={`${s.key}.season_avg`} sortState={sortState} />
                    </th>
                    <th key={`${s.key}.rolling_avg`}
                      className="text-right px-2 py-1 cursor-pointer hover:text-gray-300 whitespace-nowrap"
                      onClick={() => handleSort(`${s.key}.rolling_avg`)}
                    >
                      {nDays}d avg <SortIcon col={`${s.key}.rolling_avg`} sortState={sortState} />
                    </th>
                    <th key={`${s.key}.delta`}
                      className="text-right px-2 py-1 cursor-pointer hover:text-gray-300 whitespace-nowrap"
                      onClick={() => handleSort(`${s.key}.delta`)}
                    >
                      Δ <SortIcon col={`${s.key}.delta`} sortState={sortState} />
                    </th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPitchers.map((pitcher, idx) => {
                const isWatched = savedNames.has(pitcher.name);
                const isSeparator = hasPinned && idx === firstUnpinnedIdx;
                return (
                  <>
                    {isSeparator && (
                      <tr key={`sep-${idx}`}>
                        <td
                          colSpan={99}
                          className="border-b-2 border-brand/40 bg-brand/5 text-xs text-brand/60 text-center py-0.5"
                        >
                          — watched pitchers above —
                        </td>
                      </tr>
                    )}
                    <tr
                      key={pitcher.name}
                      className={`border-b border-surface-border/40 hover:bg-surface-border/20 ${
                        isWatched ? "bg-brand/5" : ""
                      }`}
                    >
                      {user && (
                        <td className="px-2 py-2 text-center">
                          <button
                            className={`text-base leading-none ${
                              isWatched ? "text-yellow-400" : "text-gray-600 hover:text-gray-400"
                            }`}
                            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                            onClick={() =>
                              isWatched
                                ? removeMut.mutate(pitcher.name)
                                : saveMut.mutate(pitcher.name)
                            }
                          >
                            {isWatched ? "★" : "☆"}
                          </button>
                        </td>
                      )}
                      <td className="px-3 py-2 font-medium text-gray-200 whitespace-nowrap">
                        {pitcher.name}
                      </td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                        {pitcher.team || "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">
                        {pitcher.ip.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">
                        {pitcher.n_games_season}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300 border-r border-surface-border">
                        {pitcher.n_games_rolling}
                      </td>
                      <td className="px-2 py-2 text-center text-sm border-r border-surface-border whitespace-nowrap">
                        <SignalIcons signals={pitcher.signals} />
                      </td>
                      {visibleStats.map((s) => {
                        const st = pitcher.stats[s.key];
                        const dc = deltaClass(st?.delta ?? null, st?.delta_pct ?? null, s.key);
                        return (
                          <>
                            <td key={`${pitcher.name}.${s.key}.season`}
                              className="px-2 py-2 text-right font-mono text-gray-300 border-l border-surface-border"
                            >
                              {fmtVal(st?.season_avg ?? null, s.unit)}
                            </td>
                            <td key={`${pitcher.name}.${s.key}.rolling`}
                              className="px-2 py-2 text-right font-mono text-gray-300"
                            >
                              {fmtVal(st?.rolling_avg ?? null, s.unit)}
                            </td>
                            <td key={`${pitcher.name}.${s.key}.delta`}
                              className={`px-2 py-2 text-right font-mono ${dc}`}
                            >
                              {fmtDelta(st?.delta ?? null, s.unit)}
                            </td>
                          </>
                        );
                      })}
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
