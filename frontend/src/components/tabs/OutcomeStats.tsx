import Plot from "react-plotly.js";
import MetricCard from "../ui/MetricCard";
import type { OutcomesResponse, TrendSignals } from "../../types";

interface Props {
  data: OutcomesResponse;
  targetDate: string;
  dashWidgets?: string[];
  onToggleWidget?: (id: string) => void;
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

export type OutcomeKey =
  | "exit_velo"
  | "hhr_pct"
  | "barrel_pct"
  | "k_per_9"
  | "bb_per_9"
  | "whiff_pct"
  | "swstr_pct"
  | "chase_pct"
  | "gb_pct"
  | "fb_pct"
  | "fps_pct"
  | "zone_pct"
  | "iz_whiff_pct"
  | "oz_whiff_pct"
  | "two_strike_whiff_pct"
  | "rp_consistency";

// Core outcomes shown as KPI cards + time series
export const OUTCOMES: {
  key: OutcomeKey;
  label: string;
  unit: string;
  higherIsBetter: boolean | null;
  primary: boolean;
  description: string;
}[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  { key: "exit_velo",    label: "Exit Velocity",   unit: "mph", higherIsBetter: false, primary: true,
    description: "Average exit velocity on balls in play" },
  { key: "hhr_pct",     label: "Hard Hit%",        unit: "%",   higherIsBetter: false, primary: true,
    description: "Balls hit ≥95 mph / total BIP — more predictive than avg exit velo" },
  { key: "barrel_pct",  label: "Barrel%",          unit: "%",   higherIsBetter: false, primary: true,
    description: "Barrels per PA — strongest single-outcome indicator" },
  { key: "k_per_9",     label: "K/9",              unit: "",    higherIsBetter: true,  primary: true,
    description: "Strikeouts per 9 innings" },
  { key: "bb_per_9",    label: "BB/9",             unit: "",    higherIsBetter: false, primary: true,
    description: "Walks per 9 innings" },
  { key: "whiff_pct",   label: "Whiff%",           unit: "%",   higherIsBetter: true,  primary: true,
    description: "Swing-and-miss rate on all swings" },
  { key: "swstr_pct",   label: "SwStr%",           unit: "%",   higherIsBetter: true,  primary: true,
    description: "Swinging strikes / total pitches" },
  { key: "chase_pct",   label: "Chase%",           unit: "%",   higherIsBetter: true,  primary: true,
    description: "Swings on pitches outside the zone / total out-of-zone pitches" },
  // ── Advanced ──────────────────────────────────────────────────────────────
  { key: "gb_pct",             label: "GB%",              unit: "%",   higherIsBetter: true,  primary: false,
    description: "Ground ball rate" },
  { key: "fb_pct",             label: "FB%",              unit: "%",   higherIsBetter: false, primary: false,
    description: "Fly ball rate" },
  { key: "fps_pct",            label: "F-Strike%",        unit: "%",   higherIsBetter: true,  primary: false,
    description: "First-pitch strike percentage — pitchers who attack early stay ahead in counts" },
  { key: "zone_pct",           label: "Zone%",            unit: "%",   higherIsBetter: null,  primary: false,
    description: "% of pitches in the strike zone. Low Zone% + high BB/9 = control regression risk" },
  { key: "iz_whiff_pct",       label: "In-Zone Whiff%",   unit: "%",   higherIsBetter: true,  primary: false,
    description: "Whiff rate on pitches inside the zone — pure spin/deception stuff" },
  { key: "oz_whiff_pct",       label: "O-Zone Whiff%",    unit: "%",   higherIsBetter: true,  primary: false,
    description: "Whiff rate on pitches outside the zone — chase quality, tunneling" },
  { key: "two_strike_whiff_pct", label: "2-Strike Whiff%", unit: "%",  higherIsBetter: true,  primary: false,
    description: "Swing-and-miss rate with 2 strikes — pure strikeout stuff" },
  { key: "rp_consistency",     label: "Release Spread",   unit: "ft",  higherIsBetter: false, primary: false,
    description: "Avg SD of release position X and Z — inconsistency often precedes velocity loss/injury" },
];

export const PRIMARY_OUTCOMES   = OUTCOMES.filter((o) => o.primary);
export const SECONDARY_OUTCOMES = OUTCOMES.filter((o) => !o.primary);

// ── Signal Badges ─────────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  release_speed: "Velocity", k_per_9: "K/9", bb_per_9: "BB/9",
  whiff_pct: "Whiff%", exit_velo: "Exit Velo",
};
const SIGNAL_HIB: Record<string, boolean> = {
  release_speed: true, k_per_9: true, bb_per_9: false,
  whiff_pct: true, exit_velo: false,
};

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
  for (const [stat, dir] of Object.entries(signals.arrows)) {
    const label = SIGNAL_LABELS[stat];
    if (!label) continue;
    const good  = dir === "up" ? SIGNAL_HIB[stat] : !SIGNAL_HIB[stat];
    const arrow = dir === "up" ? "↑" : "↓";
    badges.push(
      <span key={stat} className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs border ${
        good ? "bg-green-900/40 text-green-300 border-green-700/40"
             : "bg-red-900/40 text-red-300 border-red-700/40"
      }`}>
        {arrow} {label}
      </span>
    );
  }
  if (badges.length === 0) return null;
  return <div className="flex flex-wrap gap-2">{badges}</div>;
}

// ── Pin button ─────────────────────────────────────────────────────────────────

function PinBtn({
  id, dashWidgets, onToggle,
}: {
  id: string; dashWidgets: string[]; onToggle: (id: string) => void;
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

export function OutcomeTSCard({
  outcomeKey,
  data,
  targetDate,
}: {
  outcomeKey: string;
  data: OutcomesResponse;
  targetDate: string;
}) {
  const outcome = OUTCOMES.find((o) => o.key === outcomeKey);
  if (!outcome) return null;

  const dates = data.per_game_outcomes.map((r) => r.game_date);
  const vals  = data.per_game_outcomes.map(
    (r) => r[outcome.key as keyof typeof r] as number | null
  );
  const valid = vals.filter((v): v is number => v !== null);
  const avg   = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;

  const shapes: Partial<Plotly.Shape>[] = [{
    type: "line", x0: targetDate, x1: targetDate, y0: 0, y1: 1,
    xref: "x", yref: "paper",
    line: { color: "red", width: 1.5, dash: "dash" },
  }];

  return (
    <Plot
      data={[
        {
          type: "scatter", mode: "lines+markers",
          name: outcome.label, x: dates, y: vals,
          line: { color: "#3b82f6", width: 2 }, marker: { size: 4 },
        },
        ...(avg !== null ? [{
          type: "scatter" as const, mode: "lines" as const, x: dates,
          y: dates.map(() => avg),
          line: { color: "#f59e0b", width: 1, dash: "dot" as const },
          showlegend: false, hoverinfo: "skip" as const,
        }] : []),
      ]}
      layout={{
        ...DARK_LAYOUT,
        title: { text: `${outcome.label}${outcome.unit ? ` (${outcome.unit})` : ""}`, font: { size: 11 } },
        xaxis: { type: "category", tickangle: -25, nticks: 6 },
        yaxis: { title: { text: outcome.unit } },
        shapes, height: 220,
        margin: { t: 35, b: 45, l: 50, r: 10 },
        showlegend: false,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
    />
  );
}

// ── Main tab component ─────────────────────────────────────────────────────────

export default function OutcomeStats({
  data, targetDate, dashWidgets = [], onToggleWidget,
}: Props) {
  const { day_outcomes, trend_outcomes, pitch_usage_today, pitch_usage_trend, signals } = data;

  return (
    <div className="flex flex-col gap-6">

      {/* Signal badges */}
      {signals && <SignalBadges signals={signals} />}

      {/* Core KPI cards — 4 + 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PRIMARY_OUTCOMES.slice(0, 4).map((o) => (
          <MetricCard
            key={o.key} label={o.label}
            today={day_outcomes[o.key] as number | null}
            trend={trend_outcomes[o.key] as number | null}
            unit={o.unit}
            higherIsBetter={o.higherIsBetter ?? undefined}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PRIMARY_OUTCOMES.slice(4).map((o) => (
          <MetricCard
            key={o.key} label={o.label}
            today={day_outcomes[o.key] as number | null}
            trend={trend_outcomes[o.key] as number | null}
            unit={o.unit}
            higherIsBetter={o.higherIsBetter ?? undefined}
          />
        ))}
      </div>

      {/* Advanced metrics grid */}
      <details className="card cursor-pointer">
        <summary className="text-sm font-medium text-gray-300 select-none">
          Advanced Metrics
          <span className="text-xs text-gray-500 ml-2 font-normal">
            (F-Strike%, Zone%, In/Out-Zone Whiff%, 2-Strike Whiff%, Release Spread)
          </span>
        </summary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {SECONDARY_OUTCOMES.map((o) => (
            <div key={o.key} className="relative">
              <MetricCard
                label={o.label}
                today={day_outcomes[o.key] as number | null}
                trend={trend_outcomes[o.key] as number | null}
                unit={o.unit}
                higherIsBetter={o.higherIsBetter ?? undefined}
              />
              <div className="absolute top-1 right-1 text-xs text-gray-600 cursor-help" title={o.description}>ⓘ</div>
            </div>
          ))}
        </div>
      </details>

      {/* Pitch usage pies + outcome time-series side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left — pitch usage pies */}
        <div className="flex flex-col gap-4">
          <div className="card">
            <Plot
              data={[{
                type: "pie",
                labels: pitch_usage_today.map((r) => r.label),
                values: pitch_usage_today.map((r) => r.count),
                marker: { colors: PIE_COLORS },
                textinfo: "label+percent", textfont: { size: 10 }, hole: 0.35,
              }]}
              layout={{
                ...DARK_LAYOUT,
                title: { text: `Pitch Usage — ${targetDate}`, font: { size: 12 } },
                showlegend: false, height: 250,
                margin: { t: 40, b: 10, l: 10, r: 10 },
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          </div>
          <div className="card">
            <Plot
              data={[{
                type: "pie",
                labels: pitch_usage_trend.map((r) => r.label),
                values: pitch_usage_trend.map((r) => r.count),
                marker: { colors: PIE_COLORS },
                textinfo: "label+percent", textfont: { size: 10 }, hole: 0.35,
              }]}
              layout={{
                ...DARK_LAYOUT,
                title: { text: "Pitch Usage — Trend", font: { size: 12 } },
                showlegend: false, height: 250,
                margin: { t: 40, b: 10, l: 10, r: 10 },
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Right — Core outcome time-series (individually pinnable) */}
        <div className="flex flex-col gap-3">
          {PRIMARY_OUTCOMES.map((o) => (
            <div key={o.key} className="card">
              {onToggleWidget && (
                <div className="flex justify-end mb-1">
                  <PinBtn id={`os:ts:${o.key}`} dashWidgets={dashWidgets} onToggle={onToggleWidget} />
                </div>
              )}
              <OutcomeTSCard outcomeKey={o.key} data={data} targetDate={targetDate} />
            </div>
          ))}
        </div>
      </div>

      {/* Advanced time-series (below, full width, pinnable) */}
      <details className="flex flex-col gap-3">
        <summary className="text-sm font-medium text-gray-300 cursor-pointer select-none mb-2">
          Advanced Metric Time Series
        </summary>
        <div className="flex flex-col gap-3 mt-2">
          {SECONDARY_OUTCOMES.map((o) => (
            <div key={o.key} className="card">
              {onToggleWidget && (
                <div className="flex justify-end mb-1">
                  <PinBtn id={`os:ts:${o.key}`} dashWidgets={dashWidgets} onToggle={onToggleWidget} />
                </div>
              )}
              <OutcomeTSCard outcomeKey={o.key} data={data} targetDate={targetDate} />
            </div>
          ))}
        </div>
      </details>

    </div>
  );
}
