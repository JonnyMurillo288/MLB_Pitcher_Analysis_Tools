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
  TableViewRequest,
  TableViewResponse,
  LeagueTableRequest,
  LeagueTableResponse,
  GameLogResponse,
  SavedPitcher,
  Subscription,
  NotificationSettings,
  CheckoutSessionResponse,
} from "../types";

const BASE = "/api";

// Token getter type — a function that returns a Promise<string | null>
type TokenGetter = () => Promise<string | null>;

async function get<T>(path: string, getToken?: TokenGetter): Promise<T> {
  const headers: Record<string, string> = {};
  if (getToken) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  console.log(`GET ${BASE}${path} with headers:`, headers);
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function post<T>(path: string, body: unknown, getToken?: TokenGetter): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (getToken) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  console.log(`POST ${path} with headers:`, headers, "and body:", body);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function put<T>(path: string, body: unknown, getToken?: TokenGetter): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (getToken) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  console.log(`PUT ${BASE}${path} with headers:`, headers, "and body:", body);  
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PUT ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function del<T>(path: string, getToken?: TokenGetter): Promise<T> {
  const headers: Record<string, string> = {};
  if (getToken) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DELETE ${path} → ${res.status}: ${text}`);
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

// ─── Game Log ─────────────────────────────────────────────────────────────────

export const getGameLog = (
  pid: number,
  year: number
): Promise<GameLogResponse> => get(`/pitcher/${pid}/season/${year}/gamelog`);

// ─── Table View ──────────────────────────────────────────────────────────────

export const getTableView = (
  req: TableViewRequest
): Promise<TableViewResponse> => post("/analysis/table-view", req);

// ─── League Table ─────────────────────────────────────────────────────────────

export const getLeagueTable = (
  req: LeagueTableRequest
): Promise<LeagueTableResponse> => post("/analysis/league-table", req);

// ─── Regression ──────────────────────────────────────────────────────────────

export const getRegressionFeatures = (
  req: RegressionFeaturesRequest
): Promise<FeaturesResponse> => post("/regression/features", req);

export const runRegression = (
  req: RunRegressionRequest
): Promise<RegressionResponse> => post("/regression/run", req);

// ─── Saved Pitchers ───────────────────────────────────────────────────────────

export const getSavedPitchers = (getToken: TokenGetter): Promise<SavedPitcher[]> =>
  get<SavedPitcher[]>("/user/saved-pitchers", getToken);

export const savePitcher = (
  getToken: TokenGetter,
  pitcher_name: string,
  pitcher_idfg: number | null
): Promise<SavedPitcher> =>
  post("/user/saved-pitchers", { pitcher_name, pitcher_idfg }, getToken);

export const deleteSavedPitcher = (
  getToken: TokenGetter,
  pitcher_name: string
): Promise<{ ok: boolean }> =>
  del(`/user/saved-pitchers/${encodeURIComponent(pitcher_name)}`, getToken);

// ─── Subscription ─────────────────────────────────────────────────────────────

export const getSubscription = (getToken: TokenGetter): Promise<Subscription> =>
  get<Subscription>("/user/subscription", getToken);

export const createCheckoutSession = (
  getToken: TokenGetter
): Promise<CheckoutSessionResponse> =>
  post("/user/subscription/checkout", {}, getToken);

// ─── Notification Settings ────────────────────────────────────────────────────

export const getNotificationSettings = (
  getToken: TokenGetter
): Promise<NotificationSettings> =>
  get<NotificationSettings>("/user/notifications", getToken);

export const updateNotificationSettings = (
  getToken: TokenGetter,
  settings: { enabled: boolean; notification_email: string | null }
): Promise<{ ok: boolean }> =>
  put("/user/notifications", settings, getToken);
