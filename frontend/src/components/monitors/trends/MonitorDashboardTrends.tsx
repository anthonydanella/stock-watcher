import React from "react";

import type { CheckAttempt, Monitor } from "../../../types";
import { MAX_ATTEMPTS } from "./constants";
import { MonitorQuantityTrend } from "./MonitorQuantityTrend";
import { ResponseTimeCard } from "./ResponseTimeCard";
import { ResultHistoryCard } from "./ResultHistoryCard";

interface MonitorDashboardTrendsProps {
  attempts: CheckAttempt[];
  monitor?: Monitor | null;
}

export function MonitorDashboardTrends({ attempts, monitor }: MonitorDashboardTrendsProps) {
  const [activeAttemptId, setActiveAttemptId] = React.useState<number | null>(null);

  const recentAttempts = React.useMemo(() => attempts.slice(0, MAX_ATTEMPTS).reverse(), [attempts]);

  const activeAttempt = React.useMemo(
    () => recentAttempts.find((a) => a.id === activeAttemptId) ?? null,
    [activeAttemptId, recentAttempts]
  );

  const summary = React.useMemo(() => {
    const durations = recentAttempts.map((a) => a.duration_ms || 0);
    const maxDuration = Math.max(...durations, 1000);
    const averageDuration = durations.length
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
      : 0;
    return {
      averageDuration,
      maxDuration,
      points: recentAttempts.map((attempt) => ({ attempt }))
    };
  }, [recentAttempts]);

  const clearActive = React.useCallback(() => setActiveAttemptId(null), []);

  if (recentAttempts.length === 0) {
    return null;
  }

  const showQuantity = monitor?.stock_mode === "quantity";
  return (
    <div className="space-y-6">
      {showQuantity ? (
        <MonitorQuantityTrend attempts={attempts} lowThreshold={monitor?.low_stock_threshold} />
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        <ResultHistoryCard
          activeAttempt={activeAttempt}
          activeAttemptId={activeAttemptId}
          recentAttempts={recentAttempts}
          onClearActive={clearActive}
          onSetActiveId={setActiveAttemptId}
        />
        <ResponseTimeCard
          activeAttempt={activeAttempt}
          activeAttemptId={activeAttemptId}
          chart={summary}
          onClearActive={clearActive}
          onSetActiveId={setActiveAttemptId}
        />
      </div>
    </div>
  );
}
