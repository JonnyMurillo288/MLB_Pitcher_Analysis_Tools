import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";

import Sidebar from "./components/Sidebar";
import UserMenu from "./components/UserMenu";
import PitchMetrics from "./components/tabs/PitchMetrics";
import OutcomeStats from "./components/tabs/OutcomeStats";
import Regression from "./components/tabs/Regression";
import TableView from "./components/tabs/TableView";
import LeagueTable from "./components/tabs/LeagueTable";
import GameLog from "./components/tabs/GameLog";
import CustomDashboard from "./components/tabs/CustomDashboard";
import ProGate from "./components/ProGate";

import {
  getPitcherId,
  getSeasons,
  getGameDates,
  getPitchMetrics,
  getOutcomes,
  getMetrics,
  getPitchTypes,
  getSavedPitchers,
  savePitcher,
  deleteSavedPitcher,
  getSubscription,
  createCheckoutSession,
  getNotificationSettings,
  updateNotificationSettings,
} from "./api/client";

import type {
  PitchMetricsResponse,
  OutcomesResponse,
  SavedPitcher,
} from "./types";

import { useAuth } from "./contexts/AuthContext";
import AuthPage from "./pages/AuthPage";

const ALL_WIDGET_IDS = [
  "pitch-metrics",
  "outcome-stats",
  "table-view",
  "game-log",
  "regression",
  "league-table",
] as const;
type WidgetId = typeof ALL_WIDGET_IDS[number];

function PinButton({
  id,
  dashWidgets,
  onToggle,
}: {
  id: WidgetId;
  dashWidgets: WidgetId[];
  onToggle: (id: WidgetId) => void;
}) {
  const pinned = dashWidgets.includes(id);
  return (
    <button
      onClick={() => onToggle(id)}
      className={`text-xs px-2.5 py-1 rounded flex items-center gap-1.5 border transition-colors ${
        pinned
          ? "bg-brand/20 text-brand border-brand/40 hover:bg-brand/30"
          : "bg-transparent text-gray-500 border-surface-border hover:text-gray-300 hover:border-gray-500"
      }`}
      title={pinned ? "Remove from Custom tab" : "Add to Custom tab"}
    >
      📌 {pinned ? "In Custom" : "Add to Custom"}
    </button>
  );
}

export default function App() {
  const { user, loading: authLoading, getToken } = useAuth();
  const qc = useQueryClient();

  // Allow guest usage without sign-in
  const [asGuest, setAsGuest] = useState(false);
  const showApp = !!user || asGuest;

  // Handle Stripe checkout return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ── Subscription & Pro status ──────────────────────────────────────────────
  const { data: sub } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => getSubscription(getToken),
    enabled: !!user,
    staleTime: 60_000,
  });
  const isPro = sub?.status === "active";

  // ── Checkout mutation (toolbar upgrade button) ────────────────────────────
  const checkoutMutation = useMutation({
    mutationFn: () => createCheckoutSession(getToken),
    onSuccess: (data) => {
      if (data.checkout_url) window.location.href = data.checkout_url;
    },
  });

  // ── Notification settings (toolbar email toggle) ──────────────────────────
  const { data: notifSettings } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: () => getNotificationSettings(getToken),
    enabled: !!user && !!isPro,
  });

  const [notifEmail, setNotifEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const emailFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notifSettings?.notification_email) {
      setNotifEmail(notifSettings.notification_email);
    } else if (user?.email) {
      setNotifEmail(user.email);
    }
  }, [notifSettings, user]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (emailFormRef.current && !emailFormRef.current.contains(e.target as Node)) {
        setShowEmailForm(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const notifMutation = useMutation({
    mutationFn: ({ enabled, email }: { enabled: boolean; email: string }) =>
      updateNotificationSettings(getToken, { enabled, notification_email: email }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-settings"] }),
  });

  // ── Custom dashboard widget state ──────────────────────────────────────────
  const [dashWidgets, setDashWidgets] = useState<WidgetId[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pitcher_dashboard_widgets") ?? "[]");
      return (saved as string[]).filter(
        (w): w is WidgetId => (ALL_WIDGET_IDS as readonly string[]).includes(w)
      );
    } catch {
      return [];
    }
  });

  function toggleDashWidget(id: WidgetId) {
    setDashWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      localStorage.setItem("pitcher_dashboard_widgets", JSON.stringify(next));
      return next;
    });
  }

  // ── Sidebar state ──────────────────────────────────────────────────────────
  const [pitcherName, setPitcherName] = useState<string>("");
  const [dataSeason, setDataSeason] = useState<number>(new Date().getFullYear());
  const [targetDate, setTargetDate] = useState<string>("");
  const [trendType, setTrendType] = useState<"rolling" | "full_season">("full_season");
  const [nDays, setNDays] = useState<number>(20);
  const [trendSeason, setTrendSeason] = useState<number>(new Date().getFullYear());
  const [selectedPitches, setSelectedPitches] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  // ── Trigger state — only update when Run is pressed ───────────────────────
  const [committed, setCommitted] = useState<{
    pitcherId: number;
    dataSeason: number;
    targetDate: string;
    trendType: "rolling" | "full_season";
    nDays: number;
    trendSeason: number;
    selectedPitches: string[];
    selectedMetrics: string[];
  } | null>(null);

  // ── Derive pitcher ID from name ────────────────────────────────────────────
  const { data: idData } = useQuery({
    queryKey: ["pitcher-id", pitcherName],
    queryFn: () => getPitcherId(pitcherName),
    enabled: !!pitcherName,
  });

  const pitcherId: number | null = idData?.id ?? null;

  // ── Populate defaults after pitcher/season loaded ─────────────────────────
  const { data: gameDates = [] } = useQuery({
    queryKey: ["game-dates", pitcherId, dataSeason],
    queryFn: () => getGameDates(pitcherId!, dataSeason),
    enabled: pitcherId !== null,
  });

  useEffect(() => {
    if (gameDates.length > 0 && !targetDate) {
      setTargetDate(gameDates[gameDates.length - 1].date);
    }
  }, [gameDates]);

  const { data: seasons = [] } = useQuery({
    queryKey: ["seasons"],
    queryFn: getSeasons,
  });

  useEffect(() => {
    if (seasons.length > 0) {
      const latest = seasons[seasons.length - 1];
      setDataSeason(latest);
      setTrendSeason(latest);
    }
  }, [seasons]);

  const { data: pitchTypesData = [] } = useQuery({
    queryKey: ["pitch-types", pitcherId, dataSeason],
    queryFn: () => getPitchTypes(pitcherId!, dataSeason),
    enabled: pitcherId !== null,
  });

  const FASTBALL_TYPES = ["FF", "SI", "FC"];
  useEffect(() => {
    if (pitchTypesData.length > 0) {
      const all = pitchTypesData.map((p) => p.pitch_type);
      const fastballs = all.filter((pt) => FASTBALL_TYPES.includes(pt));
      setSelectedPitches(fastballs.length > 0 ? fastballs : all);
    }
  }, [pitchTypesData]);

  const { data: metricsData = [] } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
  });

  useEffect(() => {
    if (metricsData.length > 0 && selectedMetrics.length === 0) {
      setSelectedMetrics(metricsData.map((m) => m.key));
    }
  }, [metricsData]);

  // ── Saved Pitchers ─────────────────────────────────────────────────────────
  const { data: savedPitchers = [] } = useQuery<SavedPitcher[]>({
    queryKey: ["saved-pitchers"],
    queryFn: () => getSavedPitchers(getToken),
    enabled: !!user,
  });

  const savedNames = new Set(savedPitchers.map((p) => p.pitcher_name));
  const isSaved = !!pitcherName && savedNames.has(pitcherName);

  const saveMutation = useMutation({
    mutationFn: () =>
      savePitcher(getToken, pitcherName, idData?.id ? Number(idData.id) : null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-pitchers"] }),
  });

  const removeMutation = useMutation({
    mutationFn: (name: string) => deleteSavedPitcher(getToken, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-pitchers"] }),
  });

  // ── Analysis queries (fired only on commit) ───────────────────────────────
  const {
    data: pitchMetricsData,
    isFetching: fetchingMetrics,
    isError: metricsError,
    error: metricsErr,
  } = useQuery<PitchMetricsResponse>({
    queryKey: [
      "pitch-metrics",
      committed?.pitcherId,
      committed?.dataSeason,
      committed?.targetDate,
      committed?.trendType,
      committed?.nDays,
      committed?.trendSeason,
      committed?.selectedPitches,
      committed?.selectedMetrics,
    ],
    queryFn: () =>
      getPitchMetrics({
        pitcher_id: committed!.pitcherId,
        season: committed!.dataSeason,
        target_date: committed!.targetDate,
        trend_type: committed!.trendType,
        n_days: committed!.nDays,
        trend_season: committed!.trendSeason,
        pitch_types: committed!.selectedPitches,
        metrics: committed!.selectedMetrics,
      }),
    enabled: committed !== null,
  });

  const {
    data: outcomesData,
    isFetching: fetchingOutcomes,
    isError: outcomesError,
    error: outcomesErr,
  } = useQuery<OutcomesResponse>({
    queryKey: [
      "outcomes",
      committed?.pitcherId,
      committed?.dataSeason,
      committed?.targetDate,
      committed?.trendType,
      committed?.nDays,
      committed?.trendSeason,
    ],
    queryFn: () =>
      getOutcomes({
        pitcher_id: committed!.pitcherId,
        season: committed!.dataSeason,
        target_date: committed!.targetDate,
        trend_type: committed!.trendType,
        n_days: committed!.nDays,
        trend_season: committed!.trendSeason,
      }),
    enabled: committed !== null,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleRunAnalysis() {
    if (!pitcherId || !targetDate) return;
    setCommitted({
      pitcherId,
      dataSeason,
      targetDate,
      trendType,
      nDays,
      trendSeason,
      selectedPitches,
      selectedMetrics,
    });
  }

  const canRun =
    !!pitcherId && !!targetDate && selectedPitches.length > 0 && selectedMetrics.length > 0;

  const isLoading = fetchingMetrics || fetchingOutcomes;

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-raised">
        <span className="text-gray-400 animate-pulse text-sm">Loading…</span>
      </div>
    );
  }

  if (!showApp) {
    return <AuthPage onContinueAsGuest={() => setAsGuest(true)} />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#111827] border-b border-surface-border shrink-0">
        <span className="text-sm font-semibold text-gray-300">⚾ Pitcher Trend Analyzer</span>
        <div className="flex items-center gap-3">

          {/* Weekly Email toggle — Pro users only */}
          {user && isPro && (
            <div className="relative flex items-center gap-2" ref={emailFormRef}>
              <span className="text-xs text-gray-400 hidden sm:inline">Weekly Email</span>
              {/* Toggle pill */}
              <button
                disabled={notifMutation.isPending}
                onClick={() => {
                  if (notifSettings?.enabled) {
                    notifMutation.mutate({ enabled: false, email: notifEmail });
                  } else {
                    setShowEmailForm((v) => !v);
                  }
                }}
                title={notifSettings?.enabled ? "Disable weekly emails" : "Enable weekly emails"}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${
                  notifSettings?.enabled ? "bg-brand" : "bg-gray-600"
                } ${notifMutation.isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    notifSettings?.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              {/* ? tooltip */}
              <button
                className="text-xs text-gray-600 hover:text-gray-400 w-4 h-4 rounded-full border border-gray-700 flex items-center justify-center flex-shrink-0"
                title="Monday morning digest of your saved pitchers — velocity trends, K rate, whiff%, and performance signals delivered to your inbox."
              >
                ?
              </button>
              {/* Email address form popover */}
              {showEmailForm && (
                <div className="absolute right-0 top-8 bg-[#1f2937] border border-surface-border rounded-lg shadow-xl z-50 p-3 w-64">
                  <p className="text-xs text-gray-300 font-medium mb-1">Enable Weekly Email</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Monday morning digest of your saved pitchers.
                  </p>
                  <label className="text-xs text-gray-400 block mb-1">Send to:</label>
                  <input
                    type="email"
                    className="bg-surface-border text-gray-200 text-xs rounded px-2 py-1.5 w-full mb-2 outline-none focus:ring-1 focus:ring-brand"
                    value={notifEmail}
                    onChange={(e) => setNotifEmail(e.target.value)}
                    placeholder={user?.email ?? ""}
                  />
                  <div className="flex gap-2">
                    <button
                      className="text-xs bg-brand text-white px-3 py-1.5 rounded hover:opacity-90 flex-1 disabled:opacity-50"
                      disabled={notifMutation.isPending}
                      onClick={() => {
                        notifMutation.mutate({ enabled: true, email: notifEmail });
                        setShowEmailForm(false);
                      }}
                    >
                      {notifMutation.isPending ? "Saving…" : "Enable"}
                    </button>
                    <button
                      className="text-xs text-gray-400 hover:text-gray-200"
                      onClick={() => setShowEmailForm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upgrade to Pro — logged in non-Pro users */}
          {user && !isPro && (
            <button
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 rounded font-semibold disabled:opacity-60 flex items-center gap-1"
            >
              ⭐ {checkoutMutation.isPending ? "…" : "Upgrade to Pro"}
            </button>
          )}

          {/* Sign up for Pro — guests */}
          {!user && (
            <button
              onClick={() => setAsGuest(false)}
              className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 rounded font-semibold flex items-center gap-1"
            >
              ⭐ Sign up for Pro
            </button>
          )}

          {/* UserMenu / Sign In */}
          {user ? (
            <UserMenu />
          ) : (
            <button
              className="text-xs text-gray-400 hover:text-gray-200"
              onClick={() => setAsGuest(false)}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          pitcherName={pitcherName}
          dataSeason={dataSeason}
          pitcherId={pitcherId}
          targetDate={targetDate}
          trendType={trendType}
          nDays={nDays}
          trendSeason={trendSeason}
          selectedPitches={selectedPitches}
          selectedMetrics={selectedMetrics}
          savedPitchers={savedPitchers}
          isSaved={isSaved}
          isLoggedIn={!!user}
          onPitcherChange={(name) => {
            setPitcherName(name);
            setTargetDate(""); // reset date when pitcher changes
          }}
          onDataSeasonChange={setDataSeason}
          onTargetDateChange={setTargetDate}
          onTrendTypeChange={setTrendType}
          onNDaysChange={setNDays}
          onTrendSeasonChange={setTrendSeason}
          onSelectedPitchesChange={setSelectedPitches}
          onSelectedMetricsChange={setSelectedMetrics}
          onRunAnalysis={handleRunAnalysis}
          canRun={canRun}
          onSavePitcher={() => saveMutation.mutate()}
          onRemovePitcher={(name) => removeMutation.mutate(name)}
        />

        <main className="flex-1 p-6 overflow-y-auto">
          {isLoading && (
            <div className="text-gray-400 text-sm mb-4 animate-pulse">
              Loading analysis…
            </div>
          )}

          <Tabs.Root defaultValue="regression" className="flex flex-col gap-4">
            <Tabs.List className="flex border-b border-surface-border gap-1 flex-wrap">
              <Tabs.Trigger value="pitch-metrics" className="tab-trigger">
                Pitch Metrics
              </Tabs.Trigger>
              <Tabs.Trigger value="outcome-stats" className="tab-trigger">
                Outcome Stats
              </Tabs.Trigger>
              <Tabs.Trigger value="regression" className="tab-trigger">
                {!isPro && <span className="mr-1 text-gray-500 text-xs">🔒</span>}
                Regression
              </Tabs.Trigger>
              <Tabs.Trigger value="table-view" className="tab-trigger">
                Table View
              </Tabs.Trigger>
              <Tabs.Trigger value="league-table" className="tab-trigger">
                {!isPro && <span className="mr-1 text-gray-500 text-xs">🔒</span>}
                League Table
              </Tabs.Trigger>
              <Tabs.Trigger value="game-log" className="tab-trigger">
                Game Log
              </Tabs.Trigger>
              <Tabs.Trigger value="custom" className="tab-trigger">
                Custom
                {dashWidgets.length > 0 && (
                  <span className="ml-1.5 text-xs bg-brand/30 text-brand px-1.5 py-0.5 rounded-full">
                    {dashWidgets.length}
                  </span>
                )}
              </Tabs.Trigger>
            </Tabs.List>

            {/* ── Pitch Metrics ──────────────────────────────────────── */}
            <Tabs.Content value="pitch-metrics">
              {!pitcherId && (
                <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                  Select a pitcher from the sidebar.
                </div>
              )}
              {pitcherId && !committed && (
                <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                  Select a game date and click Run Analysis.
                </div>
              )}
              {committed && metricsError && (
                <div className="text-red-400 text-sm p-4">
                  Error loading pitch metrics: {(metricsErr as Error).message}
                </div>
              )}
              {committed && pitchMetricsData && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-end">
                    <PinButton
                      id="pitch-metrics"
                      dashWidgets={dashWidgets}
                      onToggle={toggleDashWidget}
                    />
                  </div>
                  <PitchMetrics
                    data={pitchMetricsData}
                    targetDate={committed.targetDate}
                  />
                </div>
              )}
            </Tabs.Content>

            {/* ── Outcome Stats ──────────────────────────────────────── */}
            <Tabs.Content value="outcome-stats">
              {!pitcherId && (
                <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                  Select a pitcher from the sidebar.
                </div>
              )}
              {pitcherId && !committed && (
                <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                  Select a game date and click Run Analysis.
                </div>
              )}
              {committed && outcomesError && (
                <div className="text-red-400 text-sm p-4">
                  Error loading outcomes: {(outcomesErr as Error).message}
                </div>
              )}
              {committed && outcomesData && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-end">
                    <PinButton
                      id="outcome-stats"
                      dashWidgets={dashWidgets}
                      onToggle={toggleDashWidget}
                    />
                  </div>
                  <OutcomeStats
                    data={outcomesData}
                    targetDate={committed.targetDate}
                  />
                </div>
              )}
            </Tabs.Content>

            {/* ── Regression ─────────────────────────────────────────── */}
            <Tabs.Content value="regression">
              {!isPro ? (
                <ProGate onSignUp={() => setAsGuest(false)} />
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-end">
                    <PinButton
                      id="regression"
                      dashWidgets={dashWidgets}
                      onToggle={toggleDashWidget}
                    />
                  </div>
                  <Regression
                    pitcherId={pitcherId ?? 0}
                    season={dataSeason}
                  />
                </div>
              )}
            </Tabs.Content>

            {/* ── Table View ─────────────────────────────────────────── */}
            <Tabs.Content value="table-view">
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <PinButton
                    id="table-view"
                    dashWidgets={dashWidgets}
                    onToggle={toggleDashWidget}
                  />
                </div>
                <TableView
                  pitcherId={pitcherId ?? 0}
                  season={dataSeason}
                />
              </div>
            </Tabs.Content>

            {/* ── League Table ───────────────────────────────────────── */}
            <Tabs.Content value="league-table">
              {!isPro ? (
                <ProGate onSignUp={() => setAsGuest(false)} />
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-end">
                    <PinButton
                      id="league-table"
                      dashWidgets={dashWidgets}
                      onToggle={toggleDashWidget}
                    />
                  </div>
                  <LeagueTable />
                </div>
              )}
            </Tabs.Content>

            {/* ── Game Log ───────────────────────────────────────────── */}
            <Tabs.Content value="game-log">
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <PinButton
                    id="game-log"
                    dashWidgets={dashWidgets}
                    onToggle={toggleDashWidget}
                  />
                </div>
                <GameLog pitcherId={pitcherId ?? 0} season={dataSeason} />
              </div>
            </Tabs.Content>

            {/* ── Custom Dashboard ───────────────────────────────────── */}
            <Tabs.Content value="custom">
              <CustomDashboard
                widgets={dashWidgets}
                onRemoveWidget={(id) => toggleDashWidget(id as WidgetId)}
                pitcherId={pitcherId ?? 0}
                season={dataSeason}
                committed={committed}
                pitchMetricsData={pitchMetricsData}
                outcomesData={outcomesData}
                isPro={!!isPro}
                onSignUp={() => setAsGuest(false)}
              />
            </Tabs.Content>
          </Tabs.Root>
        </main>
      </div>
    </div>
  );
}
