import Plot from "react-plotly.js";
import MetricCard from "../ui/MetricCard";
import type { OutcomesResponse } from "../../types";

interface Props {
  data: OutcomesResponse;
  targetDate: string;
}

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#1f2937",
  plot_bgcolor: "#1f2937",
  font: { color: "#d1d5db", size: 11 },
  margin: { t: 40, b: 50, l: 55, r: 15 },
};

const PIE_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

type OutcomeKey =
  | "exit_velo"
  | "gb_pct"
  | "fb_pct"
  | "bb_9"
  | "k_9"
  | "whiff_pct"
  | "swstr_pct"
  | "chase_pct";

const OUTCOMES: {
  key: OutcomeKey;
  label: string;
  unit: string;
  higherIsBetter: boolean;
}[] = [
  { key: "exit_velo", label: "Exit Velocity", unit: "mph", higherIsBetter: false },
  { key: "gb_pct", label: "GB%", unit: "%", higherIsBetter: true },
  { key: "fb_pct", label: "FB%", unit: "%", higherIsBetter: false },
  { key: "bb_9", label: "BB/9", unit: "", higherIsBetter: false },
  { key: "k_9", label: "K/9", unit: "", higherIsBetter: true },
  { key: "whiff_pct", label: "Whiff%", unit: "%", higherIsBetter: true },
  { key: "swstr_pct", label: "SwStr%", unit: "%", higherIsBetter: true },
  { key: "chase_pct", label: "Chase%", unit: "%", higherIsBetter: true },
];

export default function OutcomeStats({ data, targetDate }: Props) {
  const { day_outcomes, trend_outcomes, per_game_outcomes, pitch_usage_today, pitch_usage_trend } =
    data;

  const dates = per_game_outcomes.map((r) => r.game_date);

  // vertical line shape for all charts
  function makeShapes(): Partial<Plotly.Shape>[] {
    return [
      {
        type: "line",
        x0: targetDate,
        x1: targetDate,
        y0: 0,
        y1: 1,
        xref: "x",
        yref: "paper",
        line: { color: "red", width: 1.5, dash: "dash" },
      },
    ];
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI cards — 4+4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {OUTCOMES.slice(0, 4).map((o) => (
          <MetricCard
            key={o.key}
            label={o.label}
            today={day_outcomes[o.key] as number | null}
            trend={trend_outcomes[o.key] as number | null}
            unit={o.unit}
            higherIsBetter={o.higherIsBetter}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {OUTCOMES.slice(4).map((o) => (
          <MetricCard
            key={o.key}
            label={o.label}
            today={day_outcomes[o.key] as number | null}
            trend={trend_outcomes[o.key] as number | null}
            unit={o.unit}
            higherIsBetter={o.higherIsBetter}
          />
        ))}
      </div>

      {/* Pitch usage pies + outcome time-series side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left — pitch usage pies */}
        <div className="flex flex-col gap-4">
          <div className="card">
            <Plot
              data={[
                {
                  type: "pie",
                  labels: pitch_usage_today.map((r) => r.label),
                  values: pitch_usage_today.map((r) => r.count),
                  marker: { colors: PIE_COLORS },
                  textinfo: "label+percent",
                  textfont: { size: 10 },
                  hole: 0.35,
                },
              ]}
              layout={{
                ...DARK_LAYOUT,
                title: { text: `Pitch Usage — ${targetDate}`, font: { size: 12 } },
                showlegend: false,
                height: 250,
                margin: { t: 40, b: 10, l: 10, r: 10 },
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          </div>
          <div className="card">
            <Plot
              data={[
                {
                  type: "pie",
                  labels: pitch_usage_trend.map((r) => r.label),
                  values: pitch_usage_trend.map((r) => r.count),
                  marker: { colors: PIE_COLORS },
                  textinfo: "label+percent",
                  textfont: { size: 10 },
                  hole: 0.35,
                },
              ]}
              layout={{
                ...DARK_LAYOUT,
                title: { text: "Pitch Usage — Trend", font: { size: 12 } },
                showlegend: false,
                height: 250,
                margin: { t: 40, b: 10, l: 10, r: 10 },
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Right — outcome time-series (8 charts, scrollable column) */}
        <div className="flex flex-col gap-3">
          {OUTCOMES.map((o) => {
            const vals = per_game_outcomes.map((r) => r[o.key] as number | null);
            const avg = (() => {
              const valid = vals.filter((v): v is number => v !== null);
              return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
            })();
            return (
              <div key={o.key} className="card">
                <Plot
                  data={[
                    {
                      type: "scatter",
                      mode: "lines+markers",
                      name: o.label,
                      x: dates,
                      y: vals,
                      line: { color: "#3b82f6", width: 2 },
                      marker: { size: 4 },
                    },
                    ...(avg !== null
                      ? [
                          {
                            type: "scatter" as const,
                            mode: "lines" as const,
                            x: dates,
                            y: dates.map(() => avg),
                            line: { color: "#f59e0b", width: 1, dash: "dot" as const },
                            showlegend: false,
                            hoverinfo: "skip" as const,
                          },
                        ]
                      : []),
                  ]}
                  layout={{
                    ...DARK_LAYOUT,
                    title: { text: `${o.label}${o.unit ? ` (${o.unit})` : ""}`, font: { size: 11 } },
                    xaxis: { type: "category", tickangle: -25, nticks: 6 },
                    yaxis: { title: { text: o.unit } },
                    shapes: makeShapes(),
                    height: 220,
                    margin: { t: 35, b: 45, l: 50, r: 10 },
                    showlegend: false,
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: "100%" }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
