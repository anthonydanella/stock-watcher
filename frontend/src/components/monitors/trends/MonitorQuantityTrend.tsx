import React from "react";
import { Area, AreaChart, CartesianGrid, Label, ReferenceLine, XAxis, YAxis } from "recharts";

import { useIsMobile } from "../../../hooks/use-mobile";
import { formatDate, statusBadgeClass, statusLabel } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import type { CheckAttempt } from "../../../types";
import { Badge } from "../../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip } from "../../ui/chart";
import { DESKTOP_DOT_THRESHOLD, MAX_ATTEMPTS, MOBILE_DOT_THRESHOLD } from "./constants";

type QuantityDatum = {
  index: number;
  attempt: CheckAttempt;
  quantity: number;
};

const chartConfig = {
  quantity: {
    label: "Quantity",
    color: "rgb(16 185 129)"
  }
} satisfies ChartConfig;

export function MonitorQuantityTrend({
  attempts,
  lowThreshold
}: {
  attempts: CheckAttempt[];
  lowThreshold: number | null | undefined;
}) {
  const isMobile = useIsMobile();
  const series = React.useMemo(() => {
    return attempts
      .slice(0, MAX_ATTEMPTS)
      .reverse()
      .filter((attempt) => attempt.quantity != null) as (CheckAttempt & {
      quantity: number;
    })[];
  }, [attempts]);

  const data = React.useMemo<QuantityDatum[]>(
    () =>
      series.map((attempt, index) => ({
        index,
        attempt,
        quantity: attempt.quantity
      })),
    [series]
  );

  const stats = React.useMemo(() => {
    if (!series.length) {
      return { max: 0, min: 0, average: 0, latest: null as number | null };
    }
    const values = series.map((attempt) => attempt.quantity);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const average = Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
    return { max, min, average, latest: series[series.length - 1].quantity };
  }, [series]);

  const dotThreshold = isMobile ? MOBILE_DOT_THRESHOLD : DESKTOP_DOT_THRESHOLD;
  const showDots = series.length <= dotThreshold;

  const ceiling = Math.max(stats.max, lowThreshold ?? 0, 1);
  const yTicks = React.useMemo(() => [0, Math.round(ceiling / 2), ceiling], [ceiling]);

  if (!series.length) {
    return null;
  }

  return (
    <Card className="min-w-0 overflow-visible rounded-md border border-border shadow-sm ring-0">
      <CardHeader>
        <CardTitle>Quantity over time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-3xl font-semibold leading-none tabular-nums">
              {stats.latest?.toLocaleString() ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">latest</p>
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <StatItem label="Avg" value={stats.average.toLocaleString()} />
            <StatItem label="Min" value={stats.min.toLocaleString()} />
            <StatItem label="Max" value={stats.max.toLocaleString()} />
            {lowThreshold != null ? (
              <StatItem
                label="Low ≤"
                value={lowThreshold.toLocaleString()}
                valueClassName="text-yellow-700"
              />
            ) : null}
            <StatItem label="Samples" value={series.length.toLocaleString()} />
          </dl>
        </div>

        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-44 w-full [&_.recharts-tooltip-wrapper]:transition-transform [&_.recharts-tooltip-wrapper]:duration-150 [&_.recharts-tooltip-wrapper]:ease-out"
        >
          <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="quantity-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-quantity)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--color-quantity)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="4 4"
              className="stroke-border opacity-40"
            />
            <XAxis dataKey="index" hide />
            <YAxis
              width={44}
              ticks={yTicks}
              domain={[0, ceiling]}
              tickFormatter={(v) => Number(v).toLocaleString()}
              tickLine={false}
              axisLine={false}
              tick={{
                fontSize: 9,
                fontFamily: "var(--font-mono, monospace)"
              }}
              className="fill-muted-foreground"
            />
            {lowThreshold != null ? (
              <ReferenceLine
                y={lowThreshold}
                stroke="rgb(234 179 8)"
                strokeWidth={1.25}
                strokeDasharray="5 4"
                ifOverflow="extendDomain"
              >
                <Label
                  value={`Low ≤ ${lowThreshold}`}
                  position="insideTopRight"
                  className="fill-yellow-700 font-mono text-[9px] font-semibold"
                  fontSize={9}
                />
              </ReferenceLine>
            ) : null}
            <ChartTooltip
              cursor={{
                stroke: "var(--color-quantity)",
                strokeWidth: 1,
                strokeDasharray: "2 2",
                opacity: 0.6
              }}
              content={<QuantityTooltipContent />}
              isAnimationActive={false}
            />
            <Area
              dataKey="quantity"
              type="monotone"
              stroke="var(--color-quantity)"
              strokeWidth={2.25}
              fill="url(#quantity-area-grad)"
              dot={
                showDots
                  ? {
                      r: 2.5,
                      fill: "var(--color-quantity)",
                      stroke: "var(--background)",
                      strokeWidth: 1.5
                    }
                  : false
              }
              activeDot={{
                r: 4.5,
                fill: "var(--color-quantity)",
                stroke: "var(--background)",
                strokeWidth: 2.25
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

interface QuantityTooltipProps {
  active?: boolean;
  payload?: { payload: QuantityDatum }[];
}

function QuantityTooltipContent({ active, payload }: QuantityTooltipProps) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div className="flex min-w-[180px] flex-col gap-1.5 rounded-md border bg-popover/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatDate(datum.attempt.created_at)}
        </span>
        <Badge className={cn(statusBadgeClass(datum.attempt.status), "px-1.5 py-0 text-[10px]")}>
          {statusLabel(datum.attempt.status)}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Quantity</span>
        <span className="font-mono text-sm font-semibold">{datum.quantity.toLocaleString()}</span>
      </div>
    </div>
  );
}

function StatItem({
  label,
  value,
  valueClassName
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("font-mono tabular-nums text-foreground", valueClassName)}>{value}</dd>
    </div>
  );
}
