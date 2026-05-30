import { AlertTriangle, Bell, BellOff, Copy, Globe, Layers, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { formatDate, statusLabel, timeAgo } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor, NotificationRule } from "../../types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ruleHostBucket, ruleState } from "./helpers";
import { RuleMonitorList } from "./RuleMonitorList";
import type { HostBucket, RuleFilter } from "./types";

export function RuleCard({
  rule,
  monitorsById,
  totalMonitors,
  busy,
  onEdit,
  onToggle,
  onDuplicate,
  onDelete
}: {
  rule: NotificationRule;
  monitorsById: Map<number, Monitor>;
  totalMonitors: number;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const scopeSize = rule.monitor_ids.length === 0 ? totalMonitors : rule.monitor_ids.length;
  const matching = rule.current_matching_count;
  const denominator = Math.max(scopeSize, rule.threshold, 1);
  const progress = Math.min(100, (matching / denominator) * 100);
  const thresholdPos = Math.min(100, (rule.threshold / denominator) * 100);
  const state = ruleState(rule);
  const host = ruleHostBucket(rule, monitorsById);
  const statusText = rule.trigger_statuses.map(statusLabel).join(" or ").toLowerCase();
  const scopeText =
    rule.monitor_ids.length === 0
      ? `all ${totalMonitors} monitor${totalMonitors === 1 ? "" : "s"}`
      : `${rule.monitor_ids.length} monitor${rule.monitor_ids.length === 1 ? "" : "s"}`;
  const remaining = Math.max(0, rule.threshold - matching);
  const hint =
    state === "triggered"
      ? "Threshold reached"
      : state === "paused"
        ? "Paused — not evaluating"
        : remaining === 0
          ? "Ready to fire"
          : `${remaining} more needed to fire`;
  const accent =
    state === "triggered"
      ? "border-l-emerald-500"
      : state === "armed"
        ? "border-l-primary/60"
        : "border-l-muted-foreground/20";
  const tint = state === "triggered" ? "bg-emerald-50/40 dark:bg-emerald-950/10" : "";

  return (
    <Card
      size="sm"
      className={cn(
        "rounded-md border border-border border-l-4 shadow-sm ring-0 transition-shadow hover:shadow-md",
        accent,
        tint,
        !rule.enabled && "opacity-75 hover:opacity-100"
      )}
    >
      <CardContent className="space-y-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StateDot state={state} />
            <button
              type="button"
              onClick={onEdit}
              className="truncate text-left text-sm font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {rule.name}
            </button>
            <StateBadge state={state} />
            <HostChip bucket={host} />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="secondary" size="sm" disabled={busy} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <IconButton
              label={rule.enabled ? "Pause" : "Enable"}
              disabled={busy}
              onClick={onToggle}
            >
              {rule.enabled ? (
                <BellOff className="h-3.5 w-3.5" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
            </IconButton>
            <IconButton label="Duplicate" disabled={busy} onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label="Delete"
              disabled={busy}
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          Alerts when <span className="font-medium text-foreground">{rule.threshold}+</span> of{" "}
          {scopeText} are <span className="font-medium text-foreground">{statusText}</span>.
        </p>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-mono text-2xl font-semibold leading-none tabular-nums",
                  state === "triggered" && "text-emerald-700 dark:text-emerald-300"
                )}
              >
                {matching}
              </span>
              <span className="text-sm text-muted-foreground">/ {scopeSize}</span>
              <span className="text-xs text-muted-foreground">
                monitor{scopeSize === 1 ? "" : "s"} {statusText} now
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{hint}</div>
          </div>
        </div>

        <ProgressBar
          progress={progress}
          thresholdPos={thresholdPos}
          satisfied={state === "triggered"}
        />

        <RuleMonitorList rule={rule} monitorsById={monitorsById} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <span>
            Cooldown {rule.cooldown_minutes > 0 ? `${rule.cooldown_minutes} min` : "none"}
          </span>
          <span aria-hidden>·</span>
          {rule.last_triggered_at ? (
            <span title={formatDate(rule.last_triggered_at)}>
              Last triggered {timeAgo(rule.last_triggered_at)}
            </span>
          ) : (
            <span>Never triggered</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  className,
  children
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={className}
    >
      {children}
    </Button>
  );
}

function HostChip({ bucket }: { bucket: HostBucket }) {
  if (bucket.kind === "unknown") return null;
  if (bucket.kind === "mixed") {
    return (
      <Tooltip>
        <TooltipTrigger
          aria-label="Mixed-host rule"
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Mixed hosts ({bucket.hosts.length})
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-normal text-left">
          Watches monitors from {bucket.hosts.join(", ")}. Alerts work best when every monitor in a
          rule shares one retailer — consider splitting this rule into one per host.
        </TooltipContent>
      </Tooltip>
    );
  }
  if (bucket.kind === "all") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
        <Layers className="h-3 w-3" aria-hidden="true" />
        All monitors
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
      <Globe className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      {bucket.label}
    </span>
  );
}

function StateDot({ state }: { state: Exclude<RuleFilter, "all"> }) {
  const cls =
    state === "triggered"
      ? "bg-emerald-500 ring-2 ring-emerald-500/20"
      : state === "armed"
        ? "bg-primary/70"
        : "bg-muted-foreground/40";
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", cls)} aria-hidden="true" />;
}

function StateBadge({ state }: { state: Exclude<RuleFilter, "all"> }) {
  if (state === "triggered") {
    return (
      <Badge className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
        Triggered
      </Badge>
    );
  }
  if (state === "armed") {
    return (
      <Badge variant="outline" className="rounded-full">
        Armed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="rounded-full">
      Paused
    </Badge>
  );
}

function ProgressBar({
  progress,
  thresholdPos,
  satisfied
}: {
  progress: number;
  thresholdPos: number;
  satisfied: boolean;
}) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "absolute inset-y-0 left-0 transition-all",
          satisfied ? "bg-emerald-500/80" : "bg-primary/70"
        )}
        style={{ width: `${progress}%` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-y-0 w-px bg-foreground/40"
        style={{ left: `${thresholdPos}%` }}
        aria-hidden="true"
        title="Threshold"
      />
    </div>
  );
}
