import { Copy, LoaderCircle, Pause, Play, Power } from "lucide-react";
import type { ReactNode } from "react";

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

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <IconAction
          label={monitor.enabled ? "Disable" : "Enable"}
          disabled={busy}
          busy={toggling}
          onClick={() => onAction(monitor.id, "toggle", () => api.toggleMonitor(monitor.id))}
        >
          {monitor.enabled ? <Pause className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
        </IconAction>
        <IconAction
          label="Run now"
          variant="secondary"
          disabled={busy}
          busy={running}
          onClick={() => onAction(monitor.id, "run", () => api.runMonitor(monitor.id))}
        >
          <Play className="h-3.5 w-3.5" />
        </IconAction>
        {onDuplicate ? (
          <IconAction
            label="Duplicate"
            disabled={busy}
            busy={duplicating}
            onClick={() => void onDuplicate(monitor)}
          >
            <Copy className="h-3.5 w-3.5" />
          </IconAction>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => onAction(monitor.id, "toggle", () => api.toggleMonitor(monitor.id))}
      >
        {toggling ? "Saving" : monitor.enabled ? "Disable" : "Enable"}
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        aria-busy={running}
        onClick={() => onAction(monitor.id, "run", () => api.runMonitor(monitor.id))}
      >
        {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Running" : "Run"}
      </Button>
      {onDuplicate ? (
        <Tooltip>
          <TooltipTrigger
            disabled={busy}
            aria-label={`Duplicate ${monitor.name}`}
            aria-busy={duplicating}
            onClick={() => void onDuplicate(monitor)}
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            {duplicating ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </TooltipTrigger>
          <TooltipContent>Duplicate</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function IconAction({
  label,
  variant = "ghost",
  disabled,
  busy,
  onClick,
  children
}: {
  label: string;
  variant?: "ghost" | "secondary";
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        disabled={disabled}
        aria-label={label}
        aria-busy={busy}
        onClick={onClick}
        className={cn(buttonVariants({ variant, size: "icon-sm" }))}
      >
        {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
