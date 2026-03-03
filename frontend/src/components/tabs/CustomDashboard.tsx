import { useState, useRef } from "react";
import Plot from "react-plotly.js";
import type { PitchMetricsResponse, OutcomesResponse } from "../../types";
import { PitchTSCard } from "./PitchMetrics";
import { OutcomeTSCard, OUTCOMES, type OutcomeKey } from "./OutcomeStats";
import TableView from "./TableView";
import GameLog from "./GameLog";
import Regression from "./Regression";
import LeagueTable from "./LeagueTable";
import ProGate from "../ProGate";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommittedState {
  targetDate: string;
}

interface Props {
  widgets: string[];
  onRemoveWidget: (id: string) => void;
  onReorderWidgets: (newOrder: string[]) => void;
  pitcherId: number;
  season: number;
  committed: CommittedState | null;
  pitchMetricsData: PitchMetricsResponse | undefined;
  outcomesData: OutcomesResponse | undefined;
  isPro: boolean;
  onSignUp?: () => void;
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function getWidgetLabel(id: string, pitchMetricsData?: PitchMetricsResponse): string {
  switch (id) {
    case "table-view":   return "Table View";
    case "game-log":     return "Game Log";
    case "regression":   return "Regression";
    case "league-table": return "League Table";
  }
  if (id.startsWith("pm:ts:")) {
    const metric = id.slice(6);
    const label = pitchMetricsData?.comparison.find((r) => r.metric === metric)?.metric_label;
    return `${label ?? metric} — Trend`;
  }
  if (id.startsWith("os:ts:")) {
    const key = id.slice(6);
    const outcome = OUTCOMES.find((o) => o.key === key);
    return `${outcome?.label ?? key} — Trend`;
  }
  return id;
}

// ── NoData placeholder ────────────────────────────────────────────────────────

function NoData({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-gray-500 text-sm p-4">{msg}</div>
  );
}

// ── Widget content renderer ───────────────────────────────────────────────────

interface WidgetContentProps {
  id: string;
  pitcherId: number;
  season: number;
  committed: CommittedState | null;
  pitchMetricsData: PitchMetricsResponse | undefined;
  outcomesData: OutcomesResponse | undefined;
  isPro: boolean;
  onSignUp?: () => void;
}

function WidgetContent({
  id,
  pitcherId,
  season,
  committed,
  pitchMetricsData,
  outcomesData,
  isPro,
  onSignUp,
}: WidgetContentProps) {
  if (id.startsWith("pm:ts:")) {
    const metric = id.slice(6);
    if (!committed || !pitchMetricsData)
      return <NoData msg="Run analysis first to see this chart." />;
    return <PitchTSCard metric={metric} data={pitchMetricsData} targetDate={committed.targetDate} />;
  }
  if (id.startsWith("os:ts:")) {
    const key = id.slice(6);
    if (!committed || !outcomesData)
      return <NoData msg="Run analysis first to see this chart." />;
    return <OutcomeTSCard outcomeKey={key} data={outcomesData} targetDate={committed.targetDate} />;
  }
  switch (id) {
    case "table-view":
      if (pitcherId === 0) return <NoData msg="Select a pitcher to see table view." />;
      return <div className="p-4"><TableView pitcherId={pitcherId} season={season} /></div>;
    case "game-log":
      if (pitcherId === 0) return <NoData msg="Select a pitcher to see game log." />;
      return <div className="p-4"><GameLog pitcherId={pitcherId} season={season} /></div>;
    case "regression":
      if (!isPro) return <ProGate onSignUp={onSignUp} />;
      if (pitcherId === 0) return <NoData msg="Select a pitcher to run regression." />;
      return <div className="p-4"><Regression pitcherId={pitcherId} season={season} /></div>;
    case "league-table":
      if (!isPro) return <ProGate onSignUp={onSignUp} />;
      return <div className="p-4"><LeagueTable /></div>;
    default:
      return null;
  }
}

// ── Correlation math ──────────────────────────────────────────────────────────

function extractSeries(
  id: string,
  pitchMetricsData: PitchMetricsResponse | undefined,
  outcomesData: OutcomesResponse | undefined
): { date: string; value: number }[] {
  if (id.startsWith("pm:ts:")) {
    const metric = id.slice(6);
    const points = pitchMetricsData?.time_series[metric] ?? [];
    const byDate: Record<string, number[]> = {};
    for (const p of points) {
      if (p.value !== null) {
        (byDate[p.game_date] ??= []).push(p.value);
      }
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, value: vals.reduce((a, b) => a + b) / vals.length }));
  }
  if (id.startsWith("os:ts:")) {
    const key = id.slice(6) as OutcomeKey;
    return (outcomesData?.per_game_outcomes ?? [])
      .filter((r) => r[key] !== null)
      .map((r) => ({ date: r.game_date, value: r[key] as number }));
  }
  return [];
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const xm = x.reduce((a, b) => a + b, 0) / n;
  const ym = y.reduce((a, b) => a + b, 0) / n;
  const num = x.reduce((s, xi, i) => s + (xi - xm) * (y[i] - ym), 0);
  const den = Math.sqrt(
    x.reduce((s, xi) => s + (xi - xm) ** 2, 0) *
    y.reduce((s, yi) => s + (yi - ym) ** 2, 0)
  );
  return den === 0 ? 0 : num / den;
}

function acfValues(x: number[], maxLag: number): number[] {
  const n = x.length;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const variance = x.reduce((s, xi) => s + (xi - mean) ** 2, 0) / n;
  if (variance === 0) return Array(maxLag + 1).fill(0);
  return Array.from({ length: maxLag + 1 }, (_, k) => {
    if (k === 0) return 1;
    if (n <= k) return 0;
    const cov = x.slice(k).reduce((s, xi, i) => s + (xi - mean) * (x[i] - mean), 0) / n;
    return cov / variance;
  });
}

function ccfValues(x: number[], y: number[], maxLag: number): { lag: number; r: number }[] {
  return Array.from({ length: maxLag * 2 + 1 }, (_, i) => {
    const k = i - maxLag;
    const n = x.length;
    if (Math.abs(k) >= n) return { lag: k, r: 0 };
    const xa = k >= 0 ? x.slice(0, n - k) : x.slice(-k);
    const ya = k >= 0 ? y.slice(k) : y.slice(0, n + k);
    return { lag: k, r: pearson(xa, ya) };
  });
}

function alignSeries(
  ids: string[],
  pitchMetricsData: PitchMetricsResponse | undefined,
  outcomesData: OutcomesResponse | undefined
): { dates: string[]; values: Record<string, number[]> } {
  const seriesData = ids.map((id) => ({ id, data: extractSeries(id, pitchMetricsData, outcomesData) }));
  if (seriesData.length === 0) return { dates: [], values: {} };
  const dateSets = seriesData.map((s) => new Set(s.data.map((p) => p.date)));
  const sharedDates = [...dateSets[0]].filter((d) => dateSets.every((ds) => ds.has(d))).sort();
  const values: Record<string, number[]> = {};
  for (const { id, data } of seriesData) {
    const byDate = Object.fromEntries(data.map((p) => [p.date, p.value]));
    values[id] = sharedDates.map((d) => byDate[d] ?? 0);
  }
  return { dates: sharedDates, values };
}

// ── Correlation Panel ─────────────────────────────────────────────────────────

const CORR_DARK: Partial<Plotly.Layout> = {
  paper_bgcolor: "#1f2937",
  plot_bgcolor: "#111827",
  font: { color: "#d1d5db", size: 11 },
};

interface CorrPanelProps {
  tsWidgets: string[];
  pitchMetricsData: PitchMetricsResponse | undefined;
  outcomesData: OutcomesResponse | undefined;
  getLabel: (id: string) => string;
}

function CorrelationPanel({ tsWidgets, pitchMetricsData, outcomesData, getLabel }: CorrPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [maxLag, setMaxLag] = useState(10);

  // Only show widgets that have actual data loaded
  const available = tsWidgets.filter(
    (id) => extractSeries(id, pitchMetricsData, outcomesData).length > 0
  );

  if (available.length < 2) {
    return (
      <div className="border border-surface-border rounded-lg bg-[#1f2937] p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">Correlation Analysis</h3>
        <p className="text-xs text-gray-500">
          Pin 2 or more time-series charts and run analysis to enable correlation tools.
        </p>
      </div>
    );
  }

  const validSelected = selected.filter((id) => available.includes(id));

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  const hasResults = validSelected.length >= 2;
  const aligned = hasResults ? alignSeries(validSelected, pitchMetricsData, outcomesData) : null;
  const n = aligned?.dates.length ?? 0;
  const sigBand = n > 1 ? 1.96 / Math.sqrt(n) : 0.5;

  return (
    <div className="border border-surface-border rounded-lg bg-[#1f2937] p-4 flex flex-col gap-5">
      <h3 className="text-sm font-semibold text-gray-200">Correlation Analysis</h3>

      {/* Series selector chips */}
      <div>
        <p className="text-xs text-gray-400 mb-2">Select 2 or more series to analyze:</p>
        <div className="flex flex-wrap gap-2">
          {available.map((id) => {
            const sel = validSelected.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleSelect(id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  sel
                    ? "bg-brand/20 text-brand border-brand/40"
                    : "text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200"
                }`}
              >
                {sel ? "✓ " : ""}{getLabel(id)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lag window input */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">Lag window (N games):</label>
        <input
          type="number"
          min={1}
          max={50}
          value={maxLag}
          onChange={(e) => setMaxLag(Math.max(1, Math.min(50, Number(e.target.value))))}
          className="w-16 bg-[#111827] text-gray-200 text-xs rounded px-2 py-1 outline-none border border-surface-border focus:ring-1 focus:ring-brand"
        />
      </div>

      {validSelected.length === 1 && (
        <p className="text-xs text-gray-500">Select at least one more series to see results.</p>
      )}

      {hasResults && aligned && (
        <>
          <p className="text-xs text-gray-500">
            Aligned on <span className="text-gray-300 font-medium">{n}</span> shared game dates.
          </p>

          {/* Pearson correlation matrix */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">Pearson Correlation (r)</p>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="py-1 pr-4 text-left font-normal text-gray-500" />
                    {validSelected.map((id) => (
                      <th
                        key={id}
                        className="py-1 px-3 text-center font-normal text-gray-400 border-l border-surface-border"
                      >
                        {getLabel(id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validSelected.map((rowId) => (
                    <tr key={rowId} className="border-t border-surface-border">
                      <td className="py-1 pr-4 text-gray-400 whitespace-nowrap">{getLabel(rowId)}</td>
                      {validSelected.map((colId) => {
                        if (rowId === colId)
                          return (
                            <td
                              key={colId}
                              className="py-1 px-3 text-center border-l border-surface-border text-gray-600"
                            >
                              —
                            </td>
                          );
                        const r = pearson(aligned.values[rowId], aligned.values[colId]);
                        const color =
                          r > 0.5 ? "text-green-400" : r < -0.5 ? "text-red-400" : "text-gray-300";
                        return (
                          <td
                            key={colId}
                            className={`py-1 px-3 text-center border-l border-surface-border font-mono ${color}`}
                          >
                            {r.toFixed(3)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Scatter plot — only when exactly 2 selected */}
          {validSelected.length === 2 && (() => {
            const [a, b] = validSelected;
            const r = pearson(aligned.values[a], aligned.values[b]);
            return (
              <Plot
                data={[
                  {
                    type: "scatter",
                    mode: "markers",
                    x: aligned.values[a],
                    y: aligned.values[b],
                    text: aligned.dates,
                    marker: { color: "#3b82f6", size: 7, opacity: 0.8 },
                    hovertemplate: "%{text}<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>",
                  },
                ]}
                layout={{
                  ...CORR_DARK,
                  title: {
                    text: `${getLabel(a)} vs ${getLabel(b)}  (r = ${r.toFixed(3)})`,
                    font: { size: 12 },
                  },
                  xaxis: { title: { text: getLabel(a) }, gridcolor: "#374151" },
                  yaxis: { title: { text: getLabel(b) }, gridcolor: "#374151" },
                  height: 280,
                  margin: { t: 50, b: 50, l: 60, r: 20 },
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            );
          })()}

          {/* Cross-Correlation Function (CCF) — only when exactly 2 selected */}
          {validSelected.length === 2 && (() => {
            const [a, b] = validSelected;
            const ccf = ccfValues(aligned.values[a], aligned.values[b], maxLag);
            const lags = ccf.map((c) => c.lag);
            const rs = ccf.map((c) => c.r);
            return (
              <Plot
                data={[
                  {
                    type: "bar",
                    x: lags,
                    y: rs,
                    marker: { color: rs.map((r) => (r >= 0 ? "#3b82f6" : "#ef4444")) },
                    name: "CCF",
                  },
                  {
                    type: "scatter",
                    mode: "lines",
                    x: [lags[0], lags[lags.length - 1]],
                    y: [sigBand, sigBand],
                    line: { color: "#f59e0b", width: 1, dash: "dash" },
                    showlegend: false,
                    hoverinfo: "skip",
                  },
                  {
                    type: "scatter",
                    mode: "lines",
                    x: [lags[0], lags[lags.length - 1]],
                    y: [-sigBand, -sigBand],
                    line: { color: "#f59e0b", width: 1, dash: "dash" },
                    showlegend: false,
                    hoverinfo: "skip",
                  },
                ]}
                layout={{
                  ...CORR_DARK,
                  title: {
                    text: `Cross-Correlation: ${getLabel(a)} ↔ ${getLabel(b)}<br><sub>Negative lag = ${getLabel(a)} leads; Positive lag = ${getLabel(b)} leads</sub>`,
                    font: { size: 11 },
                  },
                  xaxis: { title: { text: "Lag (games)" }, gridcolor: "#374151", dtick: 1 },
                  yaxis: { title: { text: "r" }, range: [-1.05, 1.05], gridcolor: "#374151" },
                  height: 260,
                  margin: { t: 60, b: 50, l: 55, r: 15 },
                  showlegend: false,
                  annotations: [
                    {
                      x: maxLag * 0.85,
                      y: sigBand + 0.08,
                      xref: "x",
                      yref: "y",
                      text: "95% CI",
                      showarrow: false,
                      font: { size: 9, color: "#f59e0b" },
                    },
                  ],
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            );
          })()}

          {/* ACF for each selected series */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">Autocorrelation (ACF)</p>
            <div className={`grid gap-4 ${validSelected.length >= 3 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}>
              {validSelected.map((id) => {
                const vals = aligned.values[id];
                const acf = acfValues(vals, maxLag);
                return (
                  <Plot
                    key={id}
                    data={[
                      {
                        type: "bar",
                        x: acf.map((_, k) => k),
                        y: acf,
                        marker: {
                          color: acf.map((r, k) =>
                            k === 0 ? "#6b7280" : Math.abs(r) > sigBand ? "#3b82f6" : "#374151"
                          ),
                        },
                        name: "ACF",
                      },
                      {
                        type: "scatter",
                        mode: "lines",
                        x: [0, maxLag],
                        y: [sigBand, sigBand],
                        line: { color: "#f59e0b", width: 1, dash: "dash" },
                        showlegend: false,
                        hoverinfo: "skip",
                      },
                      {
                        type: "scatter",
                        mode: "lines",
                        x: [0, maxLag],
                        y: [-sigBand, -sigBand],
                        line: { color: "#f59e0b", width: 1, dash: "dash" },
                        showlegend: false,
                        hoverinfo: "skip",
                      },
                    ]}
                    layout={{
                      ...CORR_DARK,
                      title: { text: `ACF — ${getLabel(id)}`, font: { size: 11 } },
                      xaxis: { title: { text: "Lag (games)" }, gridcolor: "#374151", dtick: 1 },
                      yaxis: { title: { text: "r" }, range: [-1.1, 1.1], gridcolor: "#374151" },
                      height: 230,
                      margin: { t: 40, b: 50, l: 55, r: 15 },
                      showlegend: false,
                    }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: "100%" }}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CustomDashboard({
  widgets,
  onRemoveWidget,
  onReorderWidgets,
  pitcherId,
  season,
  committed,
  pitchMetricsData,
  outcomesData,
  isPro,
  onSignUp,
}: Props) {
  const draggingIdxRef = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function handleDragStart(idx: number) {
    draggingIdxRef.current = idx;
    setDraggingIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }

  function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    const from = draggingIdxRef.current;
    if (from === null || from === toIdx) {
      setDraggingIdx(null);
      setDragOverIdx(null);
      return;
    }
    const newOrder = [...widgets];
    const [item] = newOrder.splice(from, 1);
    newOrder.splice(toIdx, 0, item);
    onReorderWidgets(newOrder);
    draggingIdxRef.current = null;
    setDraggingIdx(null);
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    draggingIdxRef.current = null;
    setDraggingIdx(null);
    setDragOverIdx(null);
  }

  const getLabel = (id: string) => getWidgetLabel(id, pitchMetricsData);
  const tsWidgets = widgets.filter((id) => id.startsWith("pm:ts:") || id.startsWith("os:ts:"));

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <span className="text-3xl">📋</span>
        <p className="text-gray-400 text-sm font-medium">Your custom dashboard is empty.</p>
        <p className="text-gray-500 text-xs max-w-xs">
          Click the <span className="font-medium text-gray-300">📌</span> button on any chart or
          tab to pin it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {widgets.map((widgetId, idx) => {
        const isDragging = draggingIdx === idx;
        const isDropTarget = dragOverIdx === idx && draggingIdx !== null && draggingIdx !== idx;
        return (
          <div
            key={widgetId}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            className={`flex flex-col gap-2 rounded-lg transition-all ${
              isDragging ? "opacity-40 scale-[0.99]" : "opacity-100"
            } ${isDropTarget ? "ring-2 ring-brand ring-offset-1 ring-offset-[#0f172a]" : ""}`}
          >
            {/* Widget header */}
            <div className="flex items-center gap-2 select-none">
              <span
                className="text-gray-600 cursor-grab active:cursor-grabbing text-lg leading-none pb-0.5"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <h3 className="text-sm font-semibold text-gray-300 flex-1">
                {getLabel(widgetId)}
              </h3>
              <button
                onClick={() => onRemoveWidget(widgetId)}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                title="Remove from dashboard"
              >
                ✕ Remove
              </button>
            </div>

            {/* Widget body */}
            <div className="border border-surface-border rounded-lg overflow-hidden bg-[#1f2937]">
              <WidgetContent
                id={widgetId}
                pitcherId={pitcherId}
                season={season}
                committed={committed}
                pitchMetricsData={pitchMetricsData}
                outcomesData={outcomesData}
                isPro={isPro}
                onSignUp={onSignUp}
              />
            </div>
          </div>
        );
      })}

      {/* Correlation analysis panel — shown when 2+ ts widgets are pinned */}
      <CorrelationPanel
        tsWidgets={tsWidgets}
        pitchMetricsData={pitchMetricsData}
        outcomesData={outcomesData}
        getLabel={getLabel}
      />
    </div>
  );
}
