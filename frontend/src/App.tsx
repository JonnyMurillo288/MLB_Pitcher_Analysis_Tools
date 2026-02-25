import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";

import Sidebar from "./components/Sidebar";
import UserMenu from "./components/UserMenu";
import PitchMetrics from "./components/tabs/PitchMetrics";
import OutcomeStats from "./components/tabs/OutcomeStats";
import Regression from "./components/tabs/Regression";

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
} from "./api/client";

import type {
  PitchMetricsResponse,
  OutcomesResponse,
  SavedPitcher,
} from "./types";

import { useAuth } from "./contexts/AuthContext";
import AuthPage from "./pages/AuthPage";

export default function App() {
  const { user, loading: authLoading, getToken } = useAuth();
  const qc = useQueryClient();

  // Allow guest usage without sign-in
  const [asGuest, setAsGuest] = useState(() => window.location.hash === "#guest");
  const showApp = !!user || asGuest;

  // Handle Stripe checkout return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
    return <AuthPage />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#111827] border-b border-surface-border shrink-0">
        <span className="text-sm font-semibold text-gray-300">⚾ Pitcher Trend Analyzer</span>
        <div className="flex items-center gap-3">
          {!user && (
            <button
              className="text-xs text-blue-400 hover:underline"
              onClick={() => {
                setAsGuest(false);
                window.location.hash = "";
              }}
            >
              Sign in to save pitchers
            </button>
          )}
          {user ? (
            <UserMenu />
          ) : (
            <button
              className="text-xs bg-brand text-white px-3 py-1 rounded hover:opacity-90"
              onClick={() => setAsGuest(false)}
            >
              Sign In
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

          {!committed && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <p className="text-lg">Select a pitcher and click Run Analysis.</p>
              {!user && (
                <p className="text-sm mt-2 text-gray-600">
                  <button
                    className="text-blue-400 hover:underline"
                    onClick={() => setAsGuest(false)}
                  >
                    Sign in
                  </button>{" "}
                  to save your favorite pitchers across sessions.
                </p>
              )}
            </div>
          )}

          {committed && (
            <Tabs.Root defaultValue="pitch-metrics" className="flex flex-col gap-4">
              <Tabs.List className="flex border-b border-surface-border gap-1">
                <Tabs.Trigger value="pitch-metrics" className="tab-trigger">
                  Pitch Metrics
                </Tabs.Trigger>
                <Tabs.Trigger value="outcome-stats" className="tab-trigger">
                  Outcome Stats
                </Tabs.Trigger>
                <Tabs.Trigger value="regression" className="tab-trigger">
                  Regression
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="pitch-metrics">
                {metricsError && (
                  <div className="text-red-400 text-sm p-4">
                    Error loading pitch metrics: {(metricsErr as Error).message}
                  </div>
                )}
                {pitchMetricsData && (
                  <PitchMetrics
                    data={pitchMetricsData}
                    targetDate={committed.targetDate}
                  />
                )}
              </Tabs.Content>

              <Tabs.Content value="outcome-stats">
                {outcomesError && (
                  <div className="text-red-400 text-sm p-4">
                    Error loading outcomes: {(outcomesErr as Error).message}
                  </div>
                )}
                {outcomesData && (
                  <OutcomeStats
                    data={outcomesData}
                    targetDate={committed.targetDate}
                  />
                )}
              </Tabs.Content>

              <Tabs.Content value="regression">
                {committed && pitcherId && (
                  <Regression
                    pitcherId={committed.pitcherId}
                    season={committed.dataSeason}
                  />
                )}
              </Tabs.Content>
            </Tabs.Root>
          )}
        </main>
      </div>
    </div>
  );
}
