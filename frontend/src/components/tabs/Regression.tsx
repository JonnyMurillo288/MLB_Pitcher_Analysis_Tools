import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Plot from "react-plotly.js";
import { getRegressionFeatures, runRegression } from "../../api/client";
import type {
  RegressionResponse,
  LagType,
  LagConfig,
  RunRegressionRequest,
} from "../../types";

interface Props {
  pitcherId: number;
  season: number;
}

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#1f2937",
  plot_bgcolor: "#1f2937",
  font: { color: "#d1d5db", size: 11 },
  margin: { t: 40, b: 50, l: 60, r: 20 },
};

function pColor(p: number) {
  if (p < 0.01) return "text-green-400";
  if (p < 0.05) return "text-yellow-400";
  return "text-red-400";
}

function badge(ok: boolean, label: string) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
        ok ? "bg-green-900/60 text-green-300" : "bg-red-900/60 text-red-300"
      }`}
    >
      {label}
    </span>
  );
}

export default function Regression({ pitcherId, season }: Props) {
  const { data: featuresData, isLoading: loadingFeatures } = useQuery({
    queryKey: ["reg-features", pitcherId, season],
    queryFn: () => getRegressionFeatures({ pitcher_id: pitcherId, season }),
    enabled: pitcherId > 0,
  });

  const features = featuresData?.features ?? [];
  const nGames = featuresData?.n_games ?? null;

  const [yCol, setYCol] = useState<string>("");
  const [xCols, setXCols] = useState<string[]>([]);
  const [lagConfig, setLagConfig] = useState<Record<string, LagConfig>>({});

  // Persist results and detect staleness
  const [results, setResults] = useState<RegressionResponse | null>(null);
  const lastSigRef = useRef<string>("");

  const currentSig = JSON.stringify({ yCol, xCols: [...xCols].sort(), lagConfig });
  const isStale = results !== null && currentSig !== lastSigRef.current;

  // Set default y after features load
  useEffect(() => {
    if (features.length > 0 && !yCol) {
      setYCol(features[0].col);
    }
  }, [features]);

  const mutation = useMutation({
    mutationFn: (req: RunRegressionRequest) => runRegression(req),
    onSuccess: (data) => {
      setResults(data);
      lastSigRef.current = currentSig;
    },
  });

  function toggleX(col: string) {
    setXCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }

  function setLag(col: string, field: "type" | "n", value: LagType | number) {
    setLagConfig((prev) => ({
      ...prev,
      [col]: { ...(prev[col] ?? { type: "none", n: 1 }), [field]: value },
    }));
  }

  function handleRun() {
    if (!yCol || xCols.length === 0) return;
    const fullLag: Record<string, LagConfig> = {};
    xCols.forEach((col) => {
      fullLag[col] = lagConfig[col] ?? { type: "none", n: 1 };
    });
    mutation.mutate({
      pitcher_id: pitcherId,
      season,
      y_col: yCol,
      x_cols: xCols,
      lag_config: fullLag,
    });
  }

  if (loadingFeatures) {
    return (
      <div className="text-gray-400 text-sm p-6">Loading regression features…</div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Variable selection */}
      <div className="card flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-gray-300">Variable Selection</h3>

        {/* Y column */}
        <div>
          <label className="sidebar-label">Dependent Variable (Y)</label>
          <select
            className="select-base max-w-xs"
            value={yCol}
            onChange={(e) => setYCol(e.target.value)}
          >
            {features.map((f) => (
              <option key={f.col} value={f.col}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* X columns */}
        <div>
          <label className="sidebar-label">Predictors (X) — select one or more</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {features
              .filter((f) => f.col !== yCol)
              .map((f) => (
                <label key={f.col} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={xCols.includes(f.col)}
                    onChange={() => toggleX(f.col)}
                    className="accent-brand"
                  />
                  {f.label}
                </label>
              ))}
          </div>
        </div>

        {/* Lag config per predictor */}
        {xCols.length > 0 && (
          <div>
            <label className="sidebar-label">Lag / Window Configuration</label>
            <div className="flex flex-col gap-3">
              {xCols.map((col) => {
                const f = features.find((x) => x.col === col);
                const cfg = lagConfig[col] ?? { type: "none", n: 1 };
                return (
                  <div key={col} className="bg-surface-border/30 rounded p-3">
                    <div className="text-sm font-medium mb-2">
                      {f?.label ?? col}
                    </div>
                    <div className="flex flex-wrap gap-4 items-center">
                      {(["none", "lag", "rolling"] as LagType[]).map((t) => (
                        <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="radio"
                            name={`lag-type-${col}`}
                            value={t}
                            checked={cfg.type === t}
                            onChange={() => setLag(col, "type", t)}
                            className="accent-brand"
                          />
                          {t === "none" ? "None" : t === "lag" ? "Point lag" : "Rolling mean"}
                        </label>
                      ))}
                      {cfg.type !== "none" && (
                        <div className="flex items-center gap-2 text-xs">
                          <span>N = {cfg.n}</span>
                          <input
                            type="range"
                            min={1}
                            max={10}
                            value={cfg.n}
                            onChange={(e) => setLag(col, "n", Number(e.target.value))}
                            className="w-24 accent-brand"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {nGames !== null && xCols.length > 0 && (() => {
          const maxLag = Math.max(
            ...xCols.map((col) => {
              const cfg = lagConfig[col];
              return cfg && cfg.type !== "none" ? cfg.n : 0;
            })
          );
          const minNeeded = xCols.length + 2;
          if (maxLag >= nGames) {
            return (
              <div className="text-yellow-400 text-xs bg-yellow-900/20 border border-yellow-800/40 rounded px-3 py-2">
                ⚠ Max lag ({maxLag}) ≥ available games ({nGames}). Reduce the lag or select fewer predictors — need at least {maxLag + minNeeded} games for these settings.
              </div>
            );
          }
          return null;
        })()}

        {mutation.isError && (
          <div className="text-red-400 text-sm">
            Error: {(mutation.error as Error).message}
          </div>
        )}

        <button
          className="btn-primary max-w-xs"
          onClick={handleRun}
          disabled={!yCol || xCols.length === 0 || mutation.isPending}
        >
          {mutation.isPending ? "Running…" : "Run Regression"}
        </button>
      </div>

      {/* Stale warning */}
      {isStale && (
        <div className="stale-banner">
          ⚠ Inputs have changed — results below are from a previous run. Click Run
          Regression to update.
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Model summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "R²", val: results.model_summary.r2.toFixed(4) },
              { label: "Adj R²", val: results.model_summary.adj_r2.toFixed(4) },
              { label: "F-stat", val: results.model_summary.f_stat.toFixed(2) },
              {
                label: "F p-val",
                val: results.model_summary.f_pvalue < 0.001
                  ? "< 0.001"
                  : results.model_summary.f_pvalue.toFixed(3),
              },
              { label: "AIC", val: results.model_summary.aic.toFixed(1) },
              { label: "N obs", val: String(results.model_summary.n_obs) },
            ].map((s) => (
              <div key={s.label} className="card text-center">
                <div className="text-xs text-gray-400">{s.label}</div>
                <div className="text-lg font-bold font-mono">{s.val}</div>
              </div>
            ))}
          </div>

          {/* Coefficient table */}
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Coefficients</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-border text-gray-400">
                  {["Term", "Coef", "Std Err", "t", "p-value", "CI Low", "CI High"].map(
                    (h) => (
                      <th key={h} className="text-right pb-1 pr-3 first:text-left">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {results.coefficients.map((c, i) => (
                  <tr key={i} className="border-b border-surface-border/40">
                    <td className="py-1 pr-3 font-medium">{c.term}</td>
                    {[c.coef, c.std_err, c.t_stat, c.p_value, c.ci_low, c.ci_high].map(
                      (v, j) => (
                        <td
                          key={j}
                          className={`py-1 pr-3 text-right font-mono ${
                            j === 3 ? pColor(v) : ""
                          }`}
                        >
                          {Math.abs(v) < 0.001 && v !== 0
                            ? v.toExponential(2)
                            : v.toFixed(4)}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Assumption badges */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">
              Assumption Tests
            </h3>
            <div className="flex flex-wrap gap-3">
              {badge(
                results.diagnostics.shapiro.normal,
                `Shapiro-Wilk p=${results.diagnostics.shapiro.p_value.toFixed(3)} (${
                  results.diagnostics.shapiro.normal ? "normal" : "non-normal"
                })`
              )}
              {badge(
                results.diagnostics.breusch_pagan.homoscedastic,
                `Breusch-Pagan p=${results.diagnostics.breusch_pagan.p_value.toFixed(3)} (${
                  results.diagnostics.breusch_pagan.homoscedastic
                    ? "homoscedastic"
                    : "heteroscedastic"
                })`
              )}
              {badge(
                results.diagnostics.durbin_watson.ok,
                `Durbin-Watson ${results.diagnostics.durbin_watson.stat.toFixed(3)} (${
                  results.diagnostics.durbin_watson.ok ? "ok" : "autocorrelation"
                })`
              )}
            </div>

            {results.diagnostics.vif.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-400 mb-1 font-semibold">VIF</div>
                <div className="flex flex-wrap gap-2">
                  {results.diagnostics.vif.map((v) => (
                    <span
                      key={v.term}
                      className={`text-xs px-2 py-0.5 rounded font-mono ${
                        v.vif > 10
                          ? "bg-red-900/60 text-red-300"
                          : v.vif > 5
                          ? "bg-yellow-900/60 text-yellow-300"
                          : "bg-green-900/60 text-green-300"
                      }`}
                    >
                      {v.term}: {v.vif.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {results.diagnostics.adf.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-400 mb-1 font-semibold">
                  ADF (Stationarity)
                </div>
                <div className="flex flex-wrap gap-2">
                  {results.diagnostics.adf.map((a) => (
                    <span
                      key={a.col}
                      className={`text-xs px-2 py-0.5 rounded font-mono ${
                        a.stationary
                          ? "bg-green-900/60 text-green-300"
                          : "bg-red-900/60 text-red-300"
                      }`}
                    >
                      {a.col}: p={a.p_value.toFixed(3)} (
                      {a.stationary ? "stationary" : "non-stationary"})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2×2 diagnostic plots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Residuals vs Fitted */}
            <div className="card">
              <Plot
                data={[
                  {
                    type: "scatter",
                    mode: "markers",
                    x: results.plot_data.fitted,
                    y: results.plot_data.residuals,
                    marker: { color: "#3b82f6", size: 5, opacity: 0.7 },
                    name: "Residual",
                  },
                  {
                    type: "scatter",
                    mode: "lines",
                    x: [
                      Math.min(...results.plot_data.fitted),
                      Math.max(...results.plot_data.fitted),
                    ],
                    y: [0, 0],
                    line: { color: "red", dash: "dash", width: 1 },
                    showlegend: false,
                    hoverinfo: "skip",
                  },
                ]}
                layout={{
                  ...DARK_LAYOUT,
                  title: { text: "Residuals vs Fitted", font: { size: 12 } },
                  xaxis: { title: { text: "Fitted" } },
                  yaxis: { title: { text: "Residuals" } },
                  showlegend: false,
                  height: 300,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            </div>

            {/* Q-Q plot */}
            <div className="card">
              <Plot
                data={[
                  {
                    type: "scatter",
                    mode: "markers",
                    x: results.plot_data.qq_theoretical,
                    y: results.plot_data.qq_sample,
                    marker: { color: "#3b82f6", size: 5, opacity: 0.7 },
                    name: "Quantiles",
                  },
                  {
                    type: "scatter",
                    mode: "lines",
                    x: results.plot_data.qq_theoretical,
                    y: results.plot_data.qq_theoretical,
                    line: { color: "red", dash: "dash", width: 1 },
                    showlegend: false,
                    hoverinfo: "skip",
                  },
                ]}
                layout={{
                  ...DARK_LAYOUT,
                  title: { text: "Q-Q Plot", font: { size: 12 } },
                  xaxis: { title: { text: "Theoretical Quantiles" } },
                  yaxis: { title: { text: "Sample Quantiles" } },
                  showlegend: false,
                  height: 300,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            </div>

            {/* Scale-Location (sqrt|residuals| vs fitted) */}
            <div className="card">
              <Plot
                data={[
                  {
                    type: "scatter",
                    mode: "markers",
                    x: results.plot_data.fitted,
                    y: results.plot_data.residuals.map((r) => Math.sqrt(Math.abs(r))),
                    marker: { color: "#10b981", size: 5, opacity: 0.7 },
                  },
                ]}
                layout={{
                  ...DARK_LAYOUT,
                  title: { text: "Scale-Location", font: { size: 12 } },
                  xaxis: { title: { text: "Fitted" } },
                  yaxis: { title: { text: "√|Residuals|" } },
                  showlegend: false,
                  height: 300,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            </div>

            {/* Cook's Distance */}
            <div className="card">
              <Plot
                data={[
                  {
                    type: "bar",
                    x: results.plot_data.cooks.map((_, i) => i + 1),
                    y: results.plot_data.cooks,
                    marker: {
                      color: results.plot_data.cooks.map((c) =>
                        c > 1 ? "#ef4444" : c > 0.5 ? "#f59e0b" : "#3b82f6"
                      ),
                    },
                  },
                ]}
                layout={{
                  ...DARK_LAYOUT,
                  title: { text: "Cook's Distance", font: { size: 12 } },
                  xaxis: { title: { text: "Observation" } },
                  yaxis: { title: { text: "Cook's D" } },
                  showlegend: false,
                  height: 300,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* Residuals over time */}
          <div className="card">
            <Plot
              data={[
                {
                  type: "scatter",
                  mode: "lines+markers",
                  x: results.plot_data.game_dates,
                  y: results.plot_data.residuals,
                  line: { color: "#8b5cf6", width: 1.5 },
                  marker: { size: 4 },
                },
                {
                  type: "scatter",
                  mode: "lines",
                  x: results.plot_data.game_dates,
                  y: results.plot_data.game_dates.map(() => 0),
                  line: { color: "red", dash: "dash", width: 1 },
                  showlegend: false,
                  hoverinfo: "skip",
                },
              ]}
              layout={{
                ...DARK_LAYOUT,
                title: { text: "Residuals over Time", font: { size: 12 } },
                xaxis: { type: "category", tickangle: -30 },
                yaxis: { title: { text: "Residuals" } },
                showlegend: false,
                height: 280,
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          </div>

          {/* Correlation heatmap */}
          {results.correlation_matrix.labels.length > 1 && (
            <div className="card">
              <Plot
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data={[
                  {
                    type: "heatmap",
                    x: results.correlation_matrix.labels,
                    y: results.correlation_matrix.labels,
                    z: results.correlation_matrix.values,
                    colorscale: "RdBu",
                    zmid: 0,
                    zmin: -1,
                    zmax: 1,
                    text: results.correlation_matrix.values.map((row) =>
                      row.map((v) => v.toFixed(2))
                    ),
                    texttemplate: "%{text}",
                    textfont: { size: 10 },
                    hovertemplate: "%{x} × %{y}: %{z:.3f}<extra></extra>",
                  },
                ] as any}
                layout={{
                  ...DARK_LAYOUT,
                  title: { text: "Correlation Matrix", font: { size: 12 } },
                  height: 400,
                  margin: { t: 40, b: 80, l: 80, r: 20 },
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
