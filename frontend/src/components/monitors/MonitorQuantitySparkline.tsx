import React from "react";

import { cn } from "../../lib/utils";

const WIDTH = 96;
const HEIGHT = 28;

export function MonitorQuantitySparkline({
  values,
  threshold,
  className
}: {
  values: number[];
  threshold?: number | null;
  className?: string;
}) {
  const path = React.useMemo(() => buildPath(values), [values]);
  if (path == null) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>No quantity history yet</div>
    );
  }
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const thresholdY =
    threshold != null && threshold >= min && threshold <= max
      ? HEIGHT - 4 - ((threshold - min) / range) * (HEIGHT - 8)
      : null;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`Quantity history: ${values.join(", ")}`}
      className={cn("text-emerald-600 dark:text-emerald-400", className)}
      preserveAspectRatio="none"
    >
      {thresholdY != null ? (
        <line
          x1={0}
          x2={WIDTH}
          y1={thresholdY}
          y2={thresholdY}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="2 2"
        />
      ) : null}
      <path d={path.area} fill="currentColor" fillOpacity={0.18} />
      <path
        d={path.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function buildPath(values: number[]): { line: string; area: string } | null {
  if (!values.length) return null;
  const ordered = [...values].reverse();
  if (ordered.length === 1) {
    const y = HEIGHT / 2;
    return {
      line: `M0,${y} L${WIDTH},${y}`,
      area: `M0,${HEIGHT} L0,${y} L${WIDTH},${y} L${WIDTH},${HEIGHT} Z`
    };
  }
  const max = Math.max(1, ...ordered);
  const min = Math.min(0, ...ordered);
  const range = Math.max(1, max - min);
  const points = ordered.map((value, index) => {
    const x = (index / (ordered.length - 1)) * WIDTH;
    const y = HEIGHT - 4 - ((value - min) / range) * (HEIGHT - 8);
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
  return { line, area };
}
