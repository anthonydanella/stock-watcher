import { CheckCircle2 } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { api } from "../../api";
import { errorMessage } from "../../lib/format";
import type { Monitor } from "../../types";
import { InfoTooltip } from "../shared/InfoTooltip";
import { Button } from "../ui/button";
import { FleetRestingStrip } from "./FleetRestingStrip";
import { FleetRow } from "./FleetRow";
import { type LastChangeMap, partitionFleet } from "./helpers";

// A quiet group label that sits under the section header, naming each tier and
// its count so the urgency split (and the sort) is legible at a glance.
function TierLabel({
  label,
  count,
  tooltip,
  children
}: {
  label: string;
  count: number;
  tooltip: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {label} <span className="tabular-nums text-muted-foreground/70">· {count}</span>
        </span>
        <InfoTooltip side="right">{tooltip}</InfoTooltip>
      </div>
      {children}
    </div>
  );
}

export function FleetOverview({
  monitors,
  lastChanges,
  onChanged
}: {
  monitors: Monitor[];
  lastChanges: LastChangeMap;
  onChanged: () => Promise<void> | void;
}) {
  const [expandResting, setExpandResting] = React.useState(false);
  const [runningIds, setRunningIds] = React.useState<Set<number>>(() => new Set());

  const { attention, resting } = React.useMemo(
    () => partitionFleet(monitors, lastChanges),
    [monitors, lastChanges]
  );

  const run = React.useCallback(
    async (monitor: Monitor) => {
      setRunningIds((current) => new Set(current).add(monitor.id));
      try {
        await api.runMonitor(monitor.id);
        await onChanged();
      } catch (exc) {
        toast.error(errorMessage(exc, `Could not run ${monitor.name}`));
      } finally {
        setRunningIds((current) => {
          const next = new Set(current);
          next.delete(monitor.id);
          return next;
        });
      }
    },
    [onChanged]
  );

  const renderRow = (monitor: Monitor) => (
    <FleetRow
      key={monitor.id}
      monitor={monitor}
      change={lastChanges[monitor.id]}
      running={runningIds.has(monitor.id)}
      onRun={run}
    />
  );

  return (
    <div className="space-y-4">
      {attention.length ? (
        <div className="space-y-1.5">
          <TierLabel
            label="Needs attention"
            count={attention.length}
            tooltip="Monitors that are in stock, low, erroring, or cooling down — sorted most urgent first."
          />
          {attention.map(renderRow)}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2.5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-solid)]/80" />
          All clear — nothing needs attention right now.
        </div>
      )}

      {resting.length ? (
        <div className="space-y-2">
          <TierLabel
            label="Resting"
            count={resting.length}
            tooltip="Out of stock or paused — nothing to act on. Click any to open it."
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setExpandResting((value) => !value)}
            >
              {expandResting ? "Collapse" : "Show all"}
            </Button>
          </TierLabel>
          {expandResting ? (
            <div className="space-y-1.5">{resting.map(renderRow)}</div>
          ) : (
            <FleetRestingStrip monitors={resting} />
          )}
        </div>
      ) : null}
    </div>
  );
}
