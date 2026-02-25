import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";

import Sidebar from "./components/Sidebar";
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
} from "./api/client";

import type {
  PitchMetricsResponse,
  OutcomesResponse,
} from "./types";

export default function App() {
  // ── Sidebar state ──────────────────────────────────────────────────────────
  const [pitcherName, setPitcherName] = useState<string>("");
  const [dataSeason, setDataSeason] = useState<number>(new Date().getFullYear());
  const [targetDate, setTargetDate] = useState<string>("");
  const [trendType, setTrendType] = useState<"rolling" | "full_season">("rolling");
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
      setDataSeason(seasons[0]);
      setTrendSeason(seasons[0]);
    }
  }, [seasons]);

  const { data: pitchTypesData = [] } = useQuery({
    queryKey: ["pitch-types", pitcherId, dataSeason],
    queryFn: () => getPitchTypes(pitcherId!, dataSeason),
    enabled: pitcherId !== null,
  });

  useEffect(() => {
    if (pitchTypesData.length > 0) {
      setSelectedPitches(pitchTypesData.map((p) => p.pitch_type));
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

  return (
    <div className="flex min-h-screen">
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
  );
}
