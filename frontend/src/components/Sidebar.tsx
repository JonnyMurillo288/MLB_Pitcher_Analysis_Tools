import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPitchers,
  getPitchTypes,
  getGameDates,
  getMetrics,
  getSeasons,
} from "../api/client";

interface Props {
  pitcherName: string;
  dataSeason: number;
  pitcherId: number | null;
  targetDate: string;
  trendType: "rolling" | "full_season";
  nDays: number;
  trendSeason: number;
  selectedPitches: string[];
  selectedMetrics: string[];
  onPitcherChange: (name: string) => void;
  onDataSeasonChange: (y: number) => void;
  onTargetDateChange: (d: string) => void;
  onTrendTypeChange: (t: "rolling" | "full_season") => void;
  onNDaysChange: (n: number) => void;
  onTrendSeasonChange: (y: number) => void;
  onSelectedPitchesChange: (p: string[]) => void;
  onSelectedMetricsChange: (m: string[]) => void;
  onRunAnalysis: () => void;
  canRun: boolean;
}

export default function Sidebar(props: Props) {
  const {
    pitcherName,
    dataSeason,
    pitcherId,
    targetDate,
    trendType,
    nDays,
    trendSeason,
    selectedPitches,
    selectedMetrics,
    onPitcherChange,
    onDataSeasonChange,
    onTargetDateChange,
    onTrendTypeChange,
    onNDaysChange,
    onTrendSeasonChange,
    onSelectedPitchesChange,
    onSelectedMetricsChange,
    onRunAnalysis,
    canRun,
  } = props;

  const [pitcherFilter, setPitcherFilter] = useState("");

  const { data: pitchers = [], isLoading: loadingPitchers } = useQuery({
    queryKey: ["pitchers"],
    queryFn: getPitchers,
  });

  const { data: seasons = [] } = useQuery({
    queryKey: ["seasons"],
    queryFn: getSeasons,
  });

  const { data: gameDates = [] } = useQuery({
    queryKey: ["game-dates", pitcherId, dataSeason],
    queryFn: () => getGameDates(pitcherId!, dataSeason),
    enabled: pitcherId !== null,
  });

  const { data: pitchTypes = [] } = useQuery({
    queryKey: ["pitch-types", pitcherId, dataSeason],
    queryFn: () => getPitchTypes(pitcherId!, dataSeason),
    enabled: pitcherId !== null,
  });

  useEffect(() => {
    if (pitchTypes.length > 0 && selectedPitches.length === 0) {
      onSelectedPitchesChange(pitchTypes.map((pt) => pt.pitch_type));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchTypes]);

  const { data: metrics = [] } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
  });

  useEffect(() => {
    if (metrics.length > 0 && selectedMetrics.length === 0) {
      onSelectedMetricsChange(metrics.map((m) => m.key));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  const filteredPitchers = useMemo(() => {
    const q = pitcherFilter.toLowerCase();
    return q ? pitchers.filter((p) => p.name.toLowerCase().includes(q)) : pitchers;
  }, [pitchers, pitcherFilter]);

  const currentYear = new Date().getFullYear();
  const trendSeasonOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  function togglePitch(pt: string) {
    const next = selectedPitches.includes(pt)
      ? selectedPitches.filter((p) => p !== pt)
      : [...selectedPitches, pt];
    onSelectedPitchesChange(next);
  }

  function toggleMetric(key: string) {
    const next = selectedMetrics.includes(key)
      ? selectedMetrics.filter((m) => m !== key)
      : [...selectedMetrics, key];
    onSelectedMetricsChange(next);
  }

  return (
    <aside className="w-64 shrink-0 bg-surface-raised border-r border-surface-border flex flex-col p-4 gap-5 overflow-y-auto min-h-screen">
      <div>
        <span className="text-lg font-bold text-gray-100">⚾ Pitcher Analyzer</span>
      </div>

      {/* Pitcher search */}
      <div>
        <label className="sidebar-label">Pitcher</label>
        <input
          className="select-base mb-1"
          placeholder="Filter pitchers…"
          value={pitcherFilter}
          onChange={(e) => setPitcherFilter(e.target.value)}
        />
        <select
          className="select-base"
          size={6}
          value={pitcherName}
          onChange={(e) => onPitcherChange(e.target.value)}
        >
          {loadingPitchers && <option disabled>Loading…</option>}
          {filteredPitchers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Data season */}
      <div>
        <label className="sidebar-label">Data Season</label>
        <select
          className="select-base"
          value={dataSeason}
          onChange={(e) => onDataSeasonChange(Number(e.target.value))}
        >
          {seasons.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Target game date */}
      <div>
        <label className="sidebar-label">Game Date</label>
        <select
          className="select-base"
          value={targetDate}
          onChange={(e) => onTargetDateChange(e.target.value)}
          disabled={gameDates.length === 0}
        >
          {gameDates.length === 0 && <option value="">— select pitcher —</option>}
          {gameDates.map((d) => (
            <option key={d.date} value={d.date}>
              {d.date} ({d.pitches} pitches)
            </option>
          ))}
        </select>
      </div>

      {/* Trend type */}
      <div>
        <label className="sidebar-label">Trend Window</label>
        <div className="flex flex-col gap-1.5">
          {(["rolling", "full_season"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="trend_type"
                value={t}
                checked={trendType === t}
                onChange={() => onTrendTypeChange(t)}
                className="accent-brand"
              />
              {t === "rolling" ? "Rolling window" : "Full season"}
            </label>
          ))}
        </div>
      </div>

      {/* Rolling N days */}
      {trendType === "rolling" && (
        <div>
          <label className="sidebar-label">Window: {nDays} days</label>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={nDays}
            onChange={(e) => onNDaysChange(Number(e.target.value))}
            className="w-full accent-brand"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-0.5">
            <span>5</span>
            <span>60</span>
          </div>
        </div>
      )}

      {/* Trend season */}
      <div>
        <label className="sidebar-label">Trend Season</label>
        <select
          className="select-base"
          value={trendSeason}
          onChange={(e) => onTrendSeasonChange(Number(e.target.value))}
        >
          {trendSeasonOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Pitch types */}
      {pitchTypes.length > 0 && (
        <div>
          <label className="sidebar-label">Pitch Types</label>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer text-gray-400">
              <input
                type="checkbox"
                checked={selectedPitches.length === pitchTypes.length}
                onChange={() =>
                  selectedPitches.length === pitchTypes.length
                    ? onSelectedPitchesChange([])
                    : onSelectedPitchesChange(pitchTypes.map((p) => p.pitch_type))
                }
                className="accent-brand"
              />
              All
            </label>
            {pitchTypes.map((pt) => (
              <label key={pt.pitch_type} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPitches.includes(pt.pitch_type)}
                  onChange={() => togglePitch(pt.pitch_type)}
                  className="accent-brand"
                />
                {pt.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Metrics */}
      {metrics.length > 0 && (
        <div>
          <label className="sidebar-label">Metrics</label>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer text-gray-400">
              <input
                type="checkbox"
                checked={selectedMetrics.length === metrics.length}
                onChange={() =>
                  selectedMetrics.length === metrics.length
                    ? onSelectedMetricsChange([])
                    : onSelectedMetricsChange(metrics.map((m) => m.key))
                }
                className="accent-brand"
              />
              All
            </label>
            {metrics.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(m.key)}
                  onChange={() => toggleMetric(m.key)}
                  className="accent-brand"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Run button */}
      <button
        className="btn-primary mt-auto"
        onClick={onRunAnalysis}
        disabled={!canRun}
      >
        Run Analysis
      </button>
    </aside>
  );
}
