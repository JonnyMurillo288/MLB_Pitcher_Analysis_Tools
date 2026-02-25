interface Props {
  label: string;
  today: number | null;
  trend: number | null;
  unit?: string;
  higherIsBetter?: boolean;
}

function fmt(v: number | null, unit: string): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  if (unit === "%") return v.toFixed(1) + "%";
  if (unit === "mph") return v.toFixed(1);
  if (unit === "rpm") return Math.round(v).toString();
  return v.toFixed(2);
}

export default function MetricCard({
  label,
  today,
  trend,
  unit = "",
  higherIsBetter = true,
}: Props) {
  const delta =
    today !== null && trend !== null && !isNaN(today) && !isNaN(trend)
      ? today - trend
      : null;

  let badgeColor = "bg-gray-700 text-gray-300";
  if (delta !== null) {
    const positive = delta > 0;
    const good = higherIsBetter ? positive : !positive;
    badgeColor = good
      ? "bg-green-900/60 text-green-300"
      : "bg-red-900/60 text-red-300";
  }

  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <div className="flex items-end gap-3">
        <span className="text-2xl font-bold text-gray-100">
          {fmt(today, unit)}
          {today !== null && unit ? (
            <span className="text-sm text-gray-400 ml-0.5">{unit}</span>
          ) : null}
        </span>
        {delta !== null && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${badgeColor}`}>
            {delta > 0 ? "+" : ""}
            {unit === "%" ? delta.toFixed(1) + "%" : delta.toFixed(2)}
          </span>
        )}
      </div>
      <span className="text-xs text-gray-500">
        Trend avg: {fmt(trend, unit)}
        {trend !== null && unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
