import Plot from "react-plotly.js";
import MetricCard from "../ui/MetricCard";
import type { PitchMetricsResponse, ComparisonRow } from "../../types";

interface Props {
  data: PitchMetricsResponse;
  targetDate: string;
  dashWidgets?: string[];
  onToggleWidget?: (id: string) => void;
}

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#1f2937",
  plot_bgcolor: "#1f2937",
  font: { color: "#d1d5db", size: 12 },
  margin: { t: 40, b: 50, l: 60, r: 20 },
};

const PIE_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = key(item);
      (acc[k] = acc[k] || []).push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

function getColorMap(data: PitchMetricsResponse): Record<string, string> {
  const allPitchTypes = Array.from(
    new Set(Object.values(data.time_series).flatMap((pts) => pts.map((p) => p.pitch_type)))
  );
  const colorMap: Record<string, string> = {};
  allPitchTypes.forEach((pt, i) => {
    colorMap[pt] = PIE_COLORS[i % PIE_COLORS.length];
  });
  return colorMap;
}

function PieChart({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <Plot
      data={[
        {
          type: "pie",
          labels: rows.map((r) => r.label),
          values: rows.map((r) => r.count),
          marker: { colors: PIE_COLORS },
          textinfo: "label+percent",
          textfont: { size: 11 },
          hole: 0.35,
        },
      ]}
      layout={{
        ...DARK_LAYOUT,
        title: { text: title, font: { size: 13, color: "#9ca3af" } },
        showlegend: false,
        margin: { t: 40, b: 20, l: 20, r: 20 },
        height: 260,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
    />
  );
}

function PinBtn({
  id,
  dashWidgets,
  onToggle,
}: {
  id: string;
  dashWidgets: string[];
  onToggle: (id: string) => void;
}) {
  const pinned = dashWidgets.includes(id);
  return (
    <button
      onClick={() => onToggle(id)}
      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
        pinned
          ? "bg-brand/20 text-brand border-brand/30"
          : "text-gray-600 border-gray-700 hover:text-gray-300 hover:border-gray-500"
      }`}
      title={pinned ? "Remove from Custom tab" : "Pin to Custom tab"}
    >
      📌
    </button>
  );
}

// ── Exported chart component — used by CustomDashboard ────────────────────────

export function PitchTSCard({
  metric,
  data,
  targetDate,
}: {
  metric: string;
  data: PitchMetricsResponse;
  targetDate: string;
}) {
  const { time_series, comparison } = data;
  const points = time_series[metric] ?? [];

  if (points.length === 0) {
    return (
      <div className="text-gray-500 text-sm text-center py-8">No data for this metric.</div>
    );
  }

  const colorMap = getColorMap(data);
  const metricLabel = comparison.find((r) => r.metric === metric)?.metric_label ?? metric;
  const unit = comparison.find((r) => r.metric === metric)?.unit ?? "";

  const byPT = groupBy(points, (p) => p.pitch_type);

  const traces: Plotly.Data[] = Object.entries(byPT).map(([pt, pts]) => ({
    type: "scatter",
    mode: "lines+markers",
    name: pts[0]?.pitch_label ?? pt,
    x: pts.map((p) => p.game_date),
    y: pts.map((p) => p.value),
    line: { color: colorMap[pt] ?? "#6b7280", width: 2 },
    marker: { size: 5 },
    connectgaps: false,
  }));

  const trendAvgTraces: Plotly.Data[] = Object.entries(byPT).map(([pt, pts]) => {
    const validVals = pts.map((p) => p.value).filter((v): v is number => v !== null);
    const avg = validVals.length ? validVals.reduce((a, b) => a + b, 0) / validVals.length : null;
    return {
      type: "scatter",
      mode: "lines",
      name: `${pts[0]?.pitch_label ?? pt} avg`,
      x: pts.map((p) => p.game_date),
      y: pts.map(() => avg),
      line: { color: colorMap[pt] ?? "#6b7280", width: 1, dash: "dot" },
      showlegend: false,
      hoverinfo: "skip",
    };
  });

  const allDates = points.map((p) => p.game_date).sort();
  const tdIdx = allDates.indexOf(targetDate);
  const beforeDates = tdIdx >= 0 ? allDates.slice(0, tdIdx) : allDates;
  const rectEnd = beforeDates.length ? beforeDates[beforeDates.length - 1] : targetDate;

  const shapes: Partial<Plotly.Shape>[] = [
    {
      type: "line",
      x0: targetDate,
      x1: targetDate,
      y0: 0,
      y1: 1,
      xref: "x",
      yref: "paper",
      line: { color: "red", width: 2, dash: "dash" },
    },
  ];
  if (rectEnd !== targetDate) {
    shapes.push({
      type: "rect",
      x0: rectEnd,
      x1: targetDate,
      y0: 0,
      y1: 1,
      xref: "x",
      yref: "paper",
      fillcolor: "rgba(234,179,8,0.08)",
      line: { width: 0 },
    });
  }

  const annotations: Partial<Plotly.Annotations>[] = [
    {
      x: targetDate,
      y: 1,
      xref: "x",
      yref: "paper",
      text: "Target",
      showarrow: false,
      xanchor: "left",
      yanchor: "top",
      font: { color: "red", size: 10 },
    },
  ];

  return (
    <Plot
      data={[...traces, ...trendAvgTraces]}
      layout={{
        ...DARK_LAYOUT,
        title: { text: `${metricLabel}${unit ? ` (${unit})` : ""}`, font: { size: 13 } },
        xaxis: { type: "category", tickangle: -30 },
        yaxis: { title: { text: unit } },
        shapes,
        annotations,
        legend: { orientation: "h", y: -0.2 },
        height: 320,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
    />
  );
}

// ── Main tab component ─────────────────────────────────────────────────────────

export default function PitchMetrics({ data, targetDate, dashWidgets = [], onToggleWidget }: Props) {
  const { comparison, time_series, pitch_usage_today, pitch_usage_trend, kpi, pitch_mix_evolution = [], break_profile = [] } = data;

  const byMetric = groupBy(comparison, (r) => r.metric);

  // velocity vs spin scatter
  const velCol = "release_speed";
  const spinCol = "release_spin_rate";
  const velPoints = time_series[velCol] ?? [];
  const spinPoints = time_series[spinCol] ?? [];
  const colorMap = getColorMap(data);

  const scatterByPitch: Record<string, { x: number[]; y: number[]; label: string }> = {};
  velPoints.forEach((vp) => {
    const sp = spinPoints.find(
      (s) => s.game_date === vp.game_date && s.pitch_type === vp.pitch_type
    );
    if (!sp || vp.value == null || sp.value == null) return;
    if (!scatterByPitch[vp.pitch_type]) {
      scatterByPitch[vp.pitch_type] = { x: [], y: [], label: vp.pitch_label };
    }
    scatterByPitch[vp.pitch_type].x.push(vp.value);
    scatterByPitch[vp.pitch_type].y.push(sp.value);
  });

  const deltaRows = comparison.filter((r) => r.delta != null);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card text-center">
          <div className="text-xs text-gray-400">Pitches Today</div>
          <div className="text-3xl font-bold">{kpi.pitches_today}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400">Pitches (Trend)</div>
          <div className="text-3xl font-bold">{kpi.pitches_trend}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400">Pitch Types</div>
          <div className="text-3xl font-bold">{kpi.pitch_types}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400">Batters Faced</div>
          <div className="text-3xl font-bold">{kpi.batters_faced}</div>
        </div>
      </div>

      {/* Pitch usage pies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <PieChart
            title={`Pitch Usage — ${targetDate}`}
            rows={pitch_usage_today.map((r) => ({ label: r.label, count: r.count }))}
          />
        </div>
        <div className="card">
          <PieChart
            title="Pitch Usage — Trend"
            rows={pitch_usage_trend.map((r) => ({ label: r.label, count: r.count }))}
          />
        </div>
      </div>

      {/* Pitch mix evolution — stacked area */}
      {pitch_mix_evolution.length > 0 && (() => {
        const evoByPT = groupBy(pitch_mix_evolution, (p) => p.pitch_type);
        const dates = Array.from(new Set(pitch_mix_evolution.map((p) => p.game_date))).sort();
        const evoTraces: Plotly.Data[] = Object.entries(evoByPT).map(([pt, pts]) => {
          const pctByDate: Record<string, number> = {};
          pts.forEach((p) => { pctByDate[p.game_date] = p.pct; });
          return {
            type: "scatter",
            mode: "none",
            name: pts[0]?.pitch_label ?? pt,
            x: dates,
            y: dates.map((d) => pctByDate[d] ?? 0),
            stackgroup: "one",
            fillcolor: (colorMap[pt] ?? "#6b7280") + "bb",
            line: { color: colorMap[pt] ?? "#6b7280" },
            hovertemplate: `%{fullData.name}: %{y:.1f}%<extra></extra>`,
          };
        });
        return (
          <div className="card">
            <Plot
              data={evoTraces}
              layout={{
                ...DARK_LAYOUT,
                title: { text: "Pitch Mix Evolution", font: { size: 13 } },
                xaxis: { type: "category", tickangle: -30, nticks: 8 },
                yaxis: { title: { text: "%" }, range: [0, 100] },
                legend: { orientation: "h", y: -0.22 },
                height: 320,
                margin: { t: 40, b: 60, l: 50, r: 15 },
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          </div>
        );
      })()}

      {/* Metric comparison cards grouped by metric */}
      {Object.entries(byMetric).map(([metric, rows]) => {
        const metricLabel = rows[0]?.metric_label ?? metric;
        const unit = rows[0]?.unit ?? "";
        return (
          <div key={metric}>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">{metricLabel}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {rows.map((r: ComparisonRow) => (
                <MetricCard
                  key={`${metric}-${r.pitch_type}`}
                  label={r.pitch_label}
                  today={r.today}
                  trend={r.trend_avg}
                  unit={unit}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Time-series per metric — individually pinnable */}
      {Object.entries(time_series).map(([metric, points]) => {
        if (points.length === 0) return null;
        const widgetId = `pm:ts:${metric}`;
        return (
          <div key={metric} className="card">
            {onToggleWidget && (
              <div className="flex justify-end mb-1">
                <PinBtn id={widgetId} dashWidgets={dashWidgets} onToggle={onToggleWidget} />
              </div>
            )}
            <PitchTSCard metric={metric} data={data} targetDate={targetDate} />
          </div>
        );
      })}

      {/* Delta bar chart */}
      {deltaRows.length > 0 && (
        <div className="card">
          <Plot
            data={[
              {
                type: "bar",
                x: deltaRows.map((r) => `${r.metric_label} / ${r.pitch_label}`),
                y: deltaRows.map((r) => r.delta),
                marker: {
                  color: deltaRows.map((r) =>
                    (r.delta ?? 0) >= 0 ? "#10b981" : "#ef4444"
                  ),
                },
                text: deltaRows.map((r) =>
                  r.delta != null ? (r.delta > 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2)) : ""
                ),
                textposition: "outside",
              },
            ]}
            layout={{
              ...DARK_LAYOUT,
              title: { text: "Today vs Trend (Delta)", font: { size: 13 } },
              xaxis: { tickangle: -40 },
              yaxis: { title: { text: "Delta" } },
              height: 340,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
          />
        </div>
      )}

      {/* Velocity vs Spin scatter */}
      {Object.keys(scatterByPitch).length > 0 && (
        <div className="card">
          <Plot
            data={Object.entries(scatterByPitch).map(([pt, d]) => ({
              type: "scatter",
              mode: "markers",
              name: d.label,
              x: d.x,
              y: d.y,
              marker: { color: colorMap[pt], size: 6, opacity: 0.75 },
            }))}
            layout={{
              ...DARK_LAYOUT,
              title: { text: "Velocity vs Spin Rate", font: { size: 13 } },
              xaxis: { title: { text: "Velocity (mph)" } },
              yaxis: { title: { text: "Spin Rate (rpm)" } },
              legend: { orientation: "h", y: -0.2 },
              height: 350,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
          />
        </div>
      )}

      {/* Movement profile scatter */}
      {break_profile.length > 0 && (
        <div className="card">
          <Plot
            data={break_profile.map((bp) => ({
              type: "scatter",
              mode: "text+markers",
              name: bp.pitch_label,
              x: [+(bp.pfx_x * 12).toFixed(1)],
              y: [+(bp.pfx_z * 12).toFixed(1)],
              text: [bp.pitch_label],
              textposition: "top center" as const,
              textfont: { size: 10, color: colorMap[bp.pitch_type] ?? "#9ca3af" },
              marker: {
                size: Math.max(14, Math.min(36, bp.n / 15)),
                color: colorMap[bp.pitch_type] ?? "#6b7280",
                opacity: 0.85,
                line: { width: 1.5, color: "#111827" },
              },
              hovertemplate:
                `<b>${bp.pitch_label}</b><br>` +
                `H-Break: %{x:.1f}"<br>` +
                `V-Break: %{y:.1f}"` +
                (bp.release_speed != null ? `<br>Velo: ${bp.release_speed.toFixed(1)} mph` : "") +
                `<br>n=${bp.n}<extra></extra>`,
            }))}
            layout={{
              ...DARK_LAYOUT,
              title: { text: "Movement Profile (Season Avg, inches)", font: { size: 13 } },
              xaxis: {
                title: { text: "Horizontal Break (in) — arm-side +" },
                zeroline: true, zerolinecolor: "#4b5563", zerolinewidth: 1,
              },
              yaxis: {
                title: { text: "Induced Vertical Break (in)" },
                zeroline: true, zerolinecolor: "#4b5563", zerolinewidth: 1,
              },
              showlegend: false,
              height: 380,
              margin: { t: 40, b: 55, l: 65, r: 20 },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
          />
        </div>
      )}

      {/* Raw data table */}
      <details className="card cursor-pointer">
        <summary className="text-sm text-gray-400 select-none">Raw Comparison Data</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border text-gray-400">
                <th className="text-left pb-1 pr-3">Metric</th>
                <th className="text-left pb-1 pr-3">Pitch</th>
                <th className="text-right pb-1 pr-3">Today</th>
                <th className="text-right pb-1 pr-3">Trend</th>
                <th className="text-right pb-1">Delta</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((r, i) => (
                <tr key={i} className="border-b border-surface-border/50 hover:bg-surface-border/30">
                  <td className="py-1 pr-3">{r.metric_label}</td>
                  <td className="py-1 pr-3">{r.pitch_label}</td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {r.today != null ? r.today.toFixed(2) : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {r.trend_avg != null ? r.trend_avg.toFixed(2) : "—"}
                  </td>
                  <td
                    className={`py-1 text-right font-mono ${
                      r.delta != null && r.delta > 0
                        ? "text-green-400"
                        : r.delta != null && r.delta < 0
                        ? "text-red-400"
                        : "text-gray-400"
                    }`}
                  >
                    {r.delta != null
                      ? (r.delta > 0 ? "+" : "") + r.delta.toFixed(2)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
