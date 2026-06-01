import { CheckCircle2 } from "lucide-react";
import React from "react";
import { toast } from "sonner";

import { api } from "../../api";
import { errorMessage } from "../../lib/format";
import type { Monitor } from "../../types";
import { Button } from "../ui/button";
import { FleetRestingStrip } from "./FleetRestingStrip";
import { FleetRow } from "./FleetRow";
import { type LastChangeMap, partitionFleet } from "./helpers";

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
    <div className="space-y-3">
      {attention.length ? (
        <div className="space-y-1.5">{attention.map(renderRow)}</div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2.5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500/80" />
          All clear — nothing needs attention right now.
        </div>
      )}

      {resting.length ? (
        <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Resting · {resting.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setExpandResting((value) => !value)}
            >
              {expandResting ? "Collapse" : "Show all"}
            </Button>
          </div>
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
