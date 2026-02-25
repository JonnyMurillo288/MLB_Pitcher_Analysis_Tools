import type {
  PitcherOption,
  GameDateOption,
  PitchTypeOption,
  MetricOption,
  PitchMetricsRequest,
  PitchMetricsResponse,
  OutcomesRequest,
  OutcomesResponse,
  RegressionFeaturesRequest,
  FeaturesResponse,
  RunRegressionRequest,
  RegressionResponse,
} from "../types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Pitcher / meta ──────────────────────────────────────────────────────────

export const getPitchers = (): Promise<PitcherOption[]> =>
  get<PitcherOption[]>("/pitchers");

export const getPitcherId = (name: string): Promise<{ id: number | null }> =>
  get(`/pitcher/${encodeURIComponent(name)}/id`);

export const getGameDates = (
  pid: number,
  year: number
): Promise<GameDateOption[]> => get(`/pitcher/${pid}/season/${year}/dates`);

export const getPitchTypes = (
  pid: number,
  year: number
): Promise<PitchTypeOption[]> =>
  get(`/pitcher/${pid}/season/${year}/pitch-types`);

export const getMetrics = (): Promise<MetricOption[]> =>
  get<MetricOption[]>("/meta/metrics");

export const getSeasons = (): Promise<number[]> =>
  get<number[]>("/meta/seasons");

// ─── Analysis ────────────────────────────────────────────────────────────────

export const getPitchMetrics = (
  req: PitchMetricsRequest
): Promise<PitchMetricsResponse> => post("/analysis/pitch-metrics", req);

export const getOutcomes = (
  req: OutcomesRequest
): Promise<OutcomesResponse> => post("/analysis/outcomes", req);

// ─── Regression ──────────────────────────────────────────────────────────────

export const getRegressionFeatures = (
  req: RegressionFeaturesRequest
): Promise<FeaturesResponse> => post("/regression/features", req);

export const runRegression = (
  req: RunRegressionRequest
): Promise<RegressionResponse> => post("/regression/run", req);
