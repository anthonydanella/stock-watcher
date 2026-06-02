import React from "react";

import { cn } from "../../lib/utils";

const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 28;

export function MonitorQuantitySparkline({
  values,
  threshold,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className
}: {
  values: number[];
  threshold?: number | null;
  width?: number;
  height?: number;
  className?: string;
}) {
  const path = React.useMemo(() => buildPath(values, width, height), [values, width, height]);
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
      ? height - 4 - ((threshold - min) / range) * (height - 8)
      : null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Quantity history: ${values.join(", ")}`}
      className={cn("text-success-vivid", className)}
      preserveAspectRatio="none"
    >
      {thresholdY != null ? (
        <line
          x1={0}
          x2={width}
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

function buildPath(
  values: number[],
  width: number,
  height: number
): { line: string; area: string } | null {
  if (!values.length) return null;
  const ordered = [...values].reverse();
  if (ordered.length === 1) {
    const y = height / 2;
    return {
      line: `M0,${y} L${width},${y}`,
      area: `M0,${height} L0,${y} L${width},${y} L${width},${height} Z`
    };
  }
  const max = Math.max(1, ...ordered);
  const min = Math.min(0, ...ordered);
  const range = Math.max(1, max - min);
  const points = ordered.map((value, index) => {
    const x = (index / (ordered.length - 1)) * width;
    const y = height - 4 - ((value - min) / range) * (height - 8);
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}
