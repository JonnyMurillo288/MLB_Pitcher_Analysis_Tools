import type { PitchMetricsResponse, OutcomesResponse } from "../../types";
import PitchMetrics from "./PitchMetrics";
import OutcomeStats from "./OutcomeStats";
import TableView from "./TableView";
import GameLog from "./GameLog";
import Regression from "./Regression";
import LeagueTable from "./LeagueTable";
import ProGate from "../ProGate";

export const WIDGET_LABELS: Record<string, string> = {
  "pitch-metrics": "Pitch Metrics",
  "outcome-stats": "Outcome Stats",
  "table-view": "Table View",
  "game-log": "Game Log",
  "regression": "Regression",
  "league-table": "League Table",
};

interface CommittedState {
  targetDate: string;
}

interface WidgetProps {
  id: string;
  pitcherId: number;
  season: number;
  committed: CommittedState | null;
  pitchMetricsData: PitchMetricsResponse | undefined;
  outcomesData: OutcomesResponse | undefined;
  isPro: boolean;
  onSignUp?: () => void;
}

interface Props {
  widgets: string[];
  onRemoveWidget: (id: string) => void;
  pitcherId: number;
  season: number;
  committed: CommittedState | null;
  pitchMetricsData: PitchMetricsResponse | undefined;
  outcomesData: OutcomesResponse | undefined;
  isPro: boolean;
  onSignUp?: () => void;
}

function NoData({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-gray-500 text-sm p-4">
      {msg}
    </div>
  );
}

function WidgetContent({
  id,
  pitcherId,
  season,
  committed,
  pitchMetricsData,
  outcomesData,
  isPro,
  onSignUp,
}: WidgetProps) {
  switch (id) {
    case "pitch-metrics":
      if (!committed || !pitchMetricsData)
        return <NoData msg="Run analysis first to see pitch metrics." />;
      return (
        <div className="p-4">
          <PitchMetrics data={pitchMetricsData} targetDate={committed.targetDate} />
        </div>
      );

    case "outcome-stats":
      if (!committed || !outcomesData)
        return <NoData msg="Run analysis first to see outcome stats." />;
      return (
        <div className="p-4">
          <OutcomeStats data={outcomesData} targetDate={committed.targetDate} />
        </div>
      );

    case "table-view":
      if (pitcherId === 0) return <NoData msg="Select a pitcher to see table view." />;
      return (
        <div className="p-4">
          <TableView pitcherId={pitcherId} season={season} />
        </div>
      );

    case "game-log":
      if (pitcherId === 0) return <NoData msg="Select a pitcher to see game log." />;
      return (
        <div className="p-4">
          <GameLog pitcherId={pitcherId} season={season} />
        </div>
      );

    case "regression":
      if (!isPro) return <ProGate onSignUp={onSignUp} />;
      if (pitcherId === 0) return <NoData msg="Select a pitcher to run regression." />;
      return (
        <div className="p-4">
          <Regression pitcherId={pitcherId} season={season} />
        </div>
      );

    case "league-table":
      if (!isPro) return <ProGate onSignUp={onSignUp} />;
      return (
        <div className="p-4">
          <LeagueTable />
        </div>
      );

    default:
      return null;
  }
}

export default function CustomDashboard({
  widgets,
  onRemoveWidget,
  pitcherId,
  season,
  committed,
  pitchMetricsData,
  outcomesData,
  isPro,
  onSignUp,
}: Props) {
  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <span className="text-3xl">📋</span>
        <p className="text-gray-400 text-sm font-medium">Your custom dashboard is empty.</p>
        <p className="text-gray-500 text-xs max-w-sm">
          Click the{" "}
          <span className="font-medium text-gray-300">📌 Add to Custom</span>
          {" "}button at the top of any tab to pin it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {widgets.map((widgetId) => (
        <div key={widgetId} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">
              {WIDGET_LABELS[widgetId] ?? widgetId}
            </h3>
            <button
              onClick={() => onRemoveWidget(widgetId)}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              title="Remove from dashboard"
            >
              ✕ Remove
            </button>
          </div>
          <div className="border border-surface-border rounded-lg overflow-hidden">
            <WidgetContent
              id={widgetId}
              pitcherId={pitcherId}
              season={season}
              committed={committed}
              pitchMetricsData={pitchMetricsData}
              outcomesData={outcomesData}
              isPro={isPro}
              onSignUp={onSignUp}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
