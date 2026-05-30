import React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { formatDate, formatDuration, statusBadgeClass } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import type { CheckAttempt } from "../../../types";
import { PanelCard } from "../../shared/PanelCard";
import { Badge } from "../../ui/badge";
import { CardContent, CardHeader, CardTitle } from "../../ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip } from "../../ui/chart";
import { getStatusDetails } from "./constants";

interface ResponseDatum {
  index: number;
  attempt: CheckAttempt;
  duration: number;
}

interface ResponseTimeCardProps {
  activeAttempt: CheckAttempt | null;
  activeAttemptId: number | null;
  chart: {
    averageDuration: number;
    maxDuration: number;
    points: { attempt: CheckAttempt }[];
  };
  onClearActive: () => void;
  onSetActiveId: (id: number | null) => void;
}

const chartConfig = {
  duration: {
    label: "Duration",
    color: "var(--primary)"
  }
} satisfies ChartConfig;

export function ResponseTimeCard({
  activeAttempt,
  chart,
  onClearActive,
  onSetActiveId
}: ResponseTimeCardProps) {
  const data = React.useMemo<ResponseDatum[]>(
    () =>
      chart.points.map((point, index) => ({
        index,
        attempt: point.attempt,
        duration: point.attempt.duration_ms || 0
      })),
    [chart.points]
  );

  const yTicks = React.useMemo(() => {
    const ceiling = Math.max(chart.maxDuration, 1000);
    return [0, ceiling / 2, ceiling];
  }, [chart.maxDuration]);

  return (
    <PanelCard className="min-w-0 overflow-visible">
      <CardHeader>
        <CardTitle> Response time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="mt-1 text-xs text-muted-foreground">
              Average {formatDuration(chart.averageDuration)}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            Peak {formatDuration(chart.maxDuration)}
          </span>
        </div>

        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-36 w-full [&_.recharts-tooltip-wrapper]:transition-transform [&_.recharts-tooltip-wrapper]:duration-150 [&_.recharts-tooltip-wrapper]:ease-out"
        >
          <AreaChart
            data={data}
            margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
            onMouseMove={(state) => {
              const idx = state?.activeTooltipIndex;
              if (typeof idx === "number" && data[idx]) {
                onSetActiveId(data[idx].attempt.id);
              } else {
                onSetActiveId(null);
              }
            }}
            onMouseLeave={onClearActive}
          >
            <defs>
              <linearGradient id="response-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-duration)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-duration)" stopOpacity={0} />
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
              domain={[0, yTicks[yTicks.length - 1]]}
              tickFormatter={(v) => (v === 0 ? "0ms" : formatDuration(v))}
              tickLine={false}
              axisLine={false}
              tick={{
                fontSize: 9,
                fontFamily: "var(--font-mono, monospace)"
              }}
              className="fill-muted-foreground"
            />
            <ChartTooltip
              cursor={{
                stroke: "var(--color-duration)",
                strokeWidth: 1,
                strokeDasharray: "2 2",
                opacity: 0.6
              }}
              content={<ResponseTooltipContent />}
              isAnimationActive={false}
            />
            <Area
              dataKey="duration"
              type="monotone"
              stroke="var(--color-duration)"
              strokeWidth={2.25}
              fill="url(#response-area-grad)"
              dot={false}
              activeDot={(props: { cx?: number; cy?: number; payload?: ResponseDatum }) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null || !payload) return <g />;
                const color = getStatusDetails(payload.attempt.status).chartColor;
                return (
                  <g>
                    <circle cx={cx} cy={cy} r={8} fill="var(--color-duration)" fillOpacity={0.12} />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={color}
                      stroke="var(--background)"
                      strokeWidth={2.25}
                    />
                  </g>
                );
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>

        <div className="sr-only" aria-live="polite">
          {activeAttempt
            ? `${getStatusDetails(activeAttempt.status).label} at ${formatDate(activeAttempt.created_at)} in ${formatDuration(activeAttempt.duration_ms)}`
            : `Response time trend chart with ${data.length} data points.`}
        </div>
      </CardContent>
    </PanelCard>
  );
}

interface TooltipContentProps {
  active?: boolean;
  payload?: { payload: ResponseDatum }[];
}

function ResponseTooltipContent({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const attempt = payload[0].payload.attempt;
  const status = getStatusDetails(attempt.status);
  return (
    <div className="flex min-w-[170px] max-w-[220px] flex-col gap-1.5 rounded-md border bg-popover/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5">
        <span className="font-mono text-[9px] text-muted-foreground">
          {formatDate(attempt.created_at)}
        </span>
        <Badge
          className={cn(statusBadgeClass(attempt.status), "px-1.5 py-0 text-[9px] font-semibold")}
        >
          {status.label}
        </Badge>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Duration</span>
        <span className={cn("font-mono font-semibold", status.textClass)}>
          {formatDuration(attempt.duration_ms)}
        </span>
      </div>
      {attempt.http_status ? (
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">HTTP</span>
          <span className="font-mono font-medium text-foreground">{attempt.http_status}</span>
        </div>
      ) : null}
      {attempt.reason ? (
        <p className="mt-1 line-clamp-2 border-t border-border/40 pt-1 text-[10px] leading-relaxed text-muted-foreground">
          {attempt.reason}
        </p>
      ) : null}
    </div>
  );
}
