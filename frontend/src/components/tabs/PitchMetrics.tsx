import Plot from "react-plotly.js";
import MetricCard from "../ui/MetricCard";
import type { PitchMetricsResponse, ComparisonRow } from "../../types";

interface Props {
  data: PitchMetricsResponse;
  targetDate: string;
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

export default function PitchMetrics({ data, targetDate }: Props) {
  const { comparison, time_series, pitch_usage_today, pitch_usage_trend, kpi } = data;

  // group comparison by metric
  const byMetric = groupBy(comparison, (r) => r.metric);

  // group time_series entries by pitch_type for colours
  const allPitchTypes = Array.from(
    new Set(Object.values(time_series).flatMap((pts) => pts.map((p) => p.pitch_type)))
  );
  const colorMap: Record<string, string> = {};
  allPitchTypes.forEach((pt, i) => {
    colorMap[pt] = PIE_COLORS[i % PIE_COLORS.length];
  });

  // velocity vs spin scatter
  const velCol = "release_speed";
  const spinCol = "release_spin_rate";
  const velPoints = time_series[velCol] ?? [];
  const spinPoints = time_series[spinCol] ?? [];

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

  // delta bar chart data
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

      {/* Time-series per metric */}
      {Object.entries(time_series).map(([metric, points]) => {
        if (points.length === 0) return null;
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

        // trend avg dotted lines per pitch type
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

        // vertical line + rect shapes for target date
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
          <div key={metric} className="card">
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
