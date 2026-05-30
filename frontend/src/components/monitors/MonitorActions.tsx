import { Copy, LoaderCircle, Play } from "lucide-react";

import { api } from "../../api";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { Button, buttonVariants } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type MonitorActionKind = "toggle" | "run" | "duplicate";

export function MonitorActions({
  monitor,
  busyActions,
  onAction,
  onDuplicate,
  compact = false
}: {
  monitor: Monitor;
  busyActions: Record<number, MonitorActionKind>;
  onAction: (
    monitorId: number,
    kind: MonitorActionKind,
    fn: () => Promise<Monitor>
  ) => Promise<void>;
  onDuplicate?: (monitor: Monitor) => Promise<void> | void;
  compact?: boolean;
}) {
  const activeAction = busyActions[monitor.id];
  const busy = Boolean(activeAction);
  const running = activeAction === "run";
  const toggling = activeAction === "toggle";
  const duplicating = activeAction === "duplicate";
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size={compact ? "sm" : "default"}
        disabled={busy}
        onClick={() => onAction(monitor.id, "toggle", () => api.toggleMonitor(monitor.id))}
      >
        {toggling ? "Saving" : monitor.enabled ? "Disable" : "Enable"}
      </Button>
      <Button
        variant="secondary"
        size={compact ? "sm" : "default"}
        disabled={busy}
        aria-busy={running}
        onClick={() => onAction(monitor.id, "run", () => api.runMonitor(monitor.id))}
      >
        {running ? (
          <LoaderCircle className={compact ? "h-3.5 w-3.5 animate-spin" : "h-4 w-4 animate-spin"} />
        ) : (
          <Play className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        )}
        {running ? "Running" : "Run"}
      </Button>
      {onDuplicate ? (
        <Tooltip>
          <TooltipTrigger
            disabled={busy}
            aria-label={`Duplicate ${monitor.name}`}
            aria-busy={duplicating}
            onClick={() => void onDuplicate(monitor)}
            className={cn(buttonVariants({ variant: "ghost", size: compact ? "icon-sm" : "icon" }))}
          >
            {duplicating ? (
              <LoaderCircle
                className={compact ? "h-3.5 w-3.5 animate-spin" : "h-4 w-4 animate-spin"}
              />
            ) : (
              <Copy className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            )}
          </TooltipTrigger>
          <TooltipContent>Duplicate</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
