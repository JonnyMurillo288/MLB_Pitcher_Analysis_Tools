// ─── Pitcher / Season Meta ────────────────────────────────────────────────────

export interface PitcherOption {
  name: string;
  idfg: number;
  season: number;
  ip: number;
}

export interface GameDateOption {
  date: string; // "YYYY-MM-DD"
  pitches: number;
}

export interface PitchTypeOption {
  pitch_type: string;
  label: string;
}

export interface MetricOption {
  key: string;
  label: string;
  unit: string;
}

// ─── Pitch Metrics (Tab 1) ────────────────────────────────────────────────────

export interface ComparisonRow {
  metric: string;
  metric_label: string;
  pitch_type: string;
  pitch_label: string;
  today: number | null;
  trend_avg: number | null;
  delta: number | null;
  unit: string;
}

export interface TimeSeriesPoint {
  game_date: string;
  pitch_type: string;
  pitch_label: string;
  value: number | null;
}

export interface PitchUsageRow {
  pitch_type: string;
  label: string;
  count: number;
}

export interface PitchMetricsKPI {
  pitches_today: number;
  pitches_trend: number;
  pitch_types: number;
  batters_faced: number;
}

export interface PitchMetricsResponse {
  comparison: ComparisonRow[];
  time_series: Record<string, TimeSeriesPoint[]>;
  pitch_usage_today: PitchUsageRow[];
  pitch_usage_trend: PitchUsageRow[];
  kpi: PitchMetricsKPI;
}

// ─── Outcome Stats (Tab 2) ────────────────────────────────────────────────────

export interface OutcomeAgg {
  exit_velo: number | null;
  gb_pct: number | null;
  fb_pct: number | null;
  bb_9: number | null;
  k_9: number | null;
  whiff_pct: number | null;
  swstr_pct: number | null;
  chase_pct: number | null;
}

export interface OutcomeGameRow extends OutcomeAgg {
  game_date: string;
}

export interface OutcomesResponse {
  day_outcomes: OutcomeAgg;
  trend_outcomes: OutcomeAgg;
  per_game_outcomes: OutcomeGameRow[];
  pitch_usage_today: PitchUsageRow[];
  pitch_usage_trend: PitchUsageRow[];
}

// ─── Regression (Tab 3) ──────────────────────────────────────────────────────

export interface FeatureOption {
  col: string;
  label: string;
}

export interface FeaturesResponse {
  features: FeatureOption[];
}

export type LagType = "none" | "lag" | "rolling";

export interface LagConfig {
  type: LagType;
  n: number;
}

export interface RunRegressionRequest {
  pitcher_id: number;
  season: number;
  y_col: string;
  x_cols: string[];
  lag_config: Record<string, LagConfig>;
}

export interface ModelSummary {
  r2: number;
  adj_r2: number;
  f_stat: number;
  f_pvalue: number;
  aic: number;
  n_obs: number;
}

export interface CoefficientRow {
  term: string;
  coef: number;
  std_err: number;
  t_stat: number;
  p_value: number;
  ci_low: number;
  ci_high: number;
}

export interface VIFRow {
  term: string;
  vif: number;
}

export interface ADFRow {
  col: string;
  adf_stat: number;
  p_value: number;
  stationary: boolean;
}

export interface Diagnostics {
  shapiro: { stat: number; p_value: number; normal: boolean };
  breusch_pagan: { stat: number; p_value: number; homoscedastic: boolean };
  durbin_watson: { stat: number; ok: boolean };
  vif: VIFRow[];
  adf: ADFRow[];
}

export interface PlotData {
  fitted: number[];
  residuals: number[];
  game_dates: string[];
  qq_theoretical: number[];
  qq_sample: number[];
  cooks: number[];
}

export interface RegressionResponse {
  model_summary: ModelSummary;
  coefficients: CoefficientRow[];
  diagnostics: Diagnostics;
  plot_data: PlotData;
  correlation_matrix: { labels: string[]; values: number[][] };
}

// ─── Requests ────────────────────────────────────────────────────────────────

export interface PitchMetricsRequest {
  pitcher_id: number;
  season: number;
  target_date: string;
  trend_type: "rolling" | "full_season";
  n_days: number;
  trend_season: number;
  pitch_types: string[];
  metrics: string[];
}

export interface OutcomesRequest {
  pitcher_id: number;
  season: number;
  target_date: string;
  trend_type: "rolling" | "full_season";
  n_days: number;
  trend_season: number;
}

export interface RegressionFeaturesRequest {
  pitcher_id: number;
  season: number;
}

// ─── User / Auth ──────────────────────────────────────────────────────────────

export interface SavedPitcher {
  pitcher_name: string;
  pitcher_idfg: number | null;
  added_at: string;
}

export interface Subscription {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: "active" | "inactive" | "canceled";
  current_period_end: string | null;
}

export interface NotificationSettings {
  enabled: boolean;
  notification_email: string | null;
}

export interface CheckoutSessionResponse {
  checkout_url: string;
}
