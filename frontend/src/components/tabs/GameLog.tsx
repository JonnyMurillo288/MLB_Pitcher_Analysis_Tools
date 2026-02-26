import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGameLog } from "../../api/client";
import type { GameLogRow } from "../../types";

interface Props {
  pitcherId: number;
  season: number;
}

const AVAILABLE_SEASONS = [2021, 2022, 2023, 2024, 2025];

type SortDir = "asc" | "desc";
interface SortState { col: keyof GameLogRow; dir: SortDir }

function fmt(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

export default function GameLog({ pitcherId, season }: Props) {
  const [localSeason, setLocalSeason] = useState(season);
  const [sortState, setSortState] = useState<SortState>({ col: "game_date", dir: "desc" });

  useEffect(() => { setLocalSeason(season); }, [season]);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["game-log", pitcherId, localSeason],
    queryFn: () => getGameLog(pitcherId, localSeason),
    enabled: pitcherId > 0,
  });

  const sorted = useMemo<GameLogRow[]>(() => {
    if (!data) return [];
    const rows = [...data.games];
    const { col, dir } = sortState;
    const mult = dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      if (av == null && bv == null) return 0;
      if (av == null) return mult;
      if (bv == null) return -mult;
      if (typeof av === "string") return mult * (av as string).localeCompare(bv as string);
      return mult * ((av as number) - (bv as number));
    });
  }, [data, sortState]);

  function handleSort(col: keyof GameLogRow) {
    setSortState((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "game_date" ? "desc" : "asc" }
    );
  }

  function SortIcon({ col }: { col: keyof GameLogRow }) {
    if (sortState.col !== col) return <span className="text-gray-600 ml-0.5 text-xs">⇅</span>;
    return <span className="text-blue-400 ml-0.5 text-xs">{sortState.dir === "asc" ? "↑" : "↓"}</span>;
  }

  if (pitcherId === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        Select a pitcher from the sidebar.
      </div>
    );
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
        {isFetching && (
          <span className="text-xs text-gray-400 animate-pulse self-end pb-1">Loading…</span>
        )}
      </div>

      {isError && (
        <div className="text-red-400 text-sm p-4 card">
          Error: {(error as Error).message}
        </div>
      )}

      {data && sorted.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-8">No game data for this season.</div>
      )}

      {data && sorted.length > 0 && (
        <>
          <div className="text-xs text-gray-400">
            {sorted.length} game{sorted.length !== 1 ? "s" : ""}
            {" · IP is estimated from outs recorded"}
          </div>
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs text-gray-400">
                  {(
                    [
                      { col: "game_date",  label: "Date",      align: "left"  },
                      { col: "ip",         label: "IP (est.)", align: "right" },
                      { col: "tbf",        label: "TBF",       align: "right" },
                      { col: "k",          label: "K",         align: "right" },
                      { col: "bb",         label: "BB",        align: "right" },
                      { col: "hr",         label: "HR",        align: "right" },
                      { col: "velo",       label: "Velo",      align: "right" },
                      { col: "whiff_pct",  label: "Whiff%",    align: "right" },
                      { col: "exit_velo",  label: "Exit Velo", align: "right" },
                    ] as { col: keyof GameLogRow; label: string; align: string }[]
                  ).map(({ col, label, align }) => (
                    <th
                      key={col}
                      className={`px-3 py-2 cursor-pointer whitespace-nowrap hover:text-gray-200 text-${align}`}
                      onClick={() => handleSort(col)}
                    >
                      {label} <SortIcon col={col} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr
                    key={row.game_date}
                    className="border-b border-surface-border/40 hover:bg-surface-border/20"
                  >
                    <td className="px-3 py-2 text-gray-300 font-mono whitespace-nowrap">
                      {row.game_date}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {row.ip != null ? row.ip.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{row.tbf}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-200 font-semibold">{row.k}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{row.bb}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{row.hr}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {fmt(row.velo)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {row.whiff_pct != null ? fmt(row.whiff_pct) + "%" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {fmt(row.exit_velo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
