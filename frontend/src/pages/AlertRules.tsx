import {
  AlertTriangle,
  Bell,
  BellOff,
  Copy,
  Globe,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { api } from "../api";
import { AlertRuleEditor } from "../components/alerts/AlertRuleEditor";
import { hostFromUrl } from "../components/monitors/editor/helpers";
import { EmptyState } from "../components/shared/EmptyState";
import { PageHeader } from "../components/shared/PageHeader";
import { MonitorListSkeleton } from "../components/shared/Skeletons";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Toggle } from "../components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { errorMessage, formatDate, statusLabel, timeAgo } from "../lib/format";
import { cn } from "../lib/utils";
import type { Monitor, NotificationRule, NotificationRuleInput } from "../types";

type RuleFilter = "all" | "triggered" | "armed" | "paused";

const RULE_FILTERS: { id: RuleFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "triggered", label: "Triggered" },
  { id: "armed", label: "Armed" },
  { id: "paused", label: "Paused" }
];

function ruleState(rule: NotificationRule): Exclude<RuleFilter, "all"> {
  if (!rule.enabled) return "paused";
  if (rule.currently_satisfied) return "triggered";
  return "armed";
}

type HostBucket = {
  kind: "single" | "all" | "mixed" | "unknown";
  /** Stable key used for grouping & sorting. */
  key: string;
  /** Human-facing label. For single-host rules this is the bare hostname. */
  label: string;
  /** Unique sorted hosts the rule watches (empty for "all" / "unknown"). */
  hosts: string[];
};

function ruleHostBucket(rule: NotificationRule, monitorsById: Map<number, Monitor>): HostBucket {
  if (rule.monitor_ids.length === 0) {
    return { kind: "all", key: "all", label: "All monitors", hosts: [] };
  }
  const hosts = new Set<string>();
  for (const id of rule.monitor_ids) {
    const monitor = monitorsById.get(id);
    if (!monitor) continue;
    const host = hostFromUrl(monitor.url);
    if (host) hosts.add(host);
  }
  if (hosts.size === 0) {
    return { kind: "unknown", key: "unknown", label: "Unknown host", hosts: [] };
  }
  if (hosts.size === 1) {
    const [host] = hosts;
    return { kind: "single", key: `single:${host}`, label: host, hosts: [host] };
  }
  const sortedHosts = [...hosts].sort();
  return { kind: "mixed", key: "mixed", label: "Mixed hosts", hosts: sortedHosts };
}

const HOST_BUCKET_ORDER: Record<HostBucket["kind"], number> = {
  single: 0,
  all: 1,
  mixed: 2,
  unknown: 3
};

function groupVisibleByHost(
  rules: NotificationRule[],
  monitorsById: Map<number, Monitor>
): [HostBucket, NotificationRule[]][] {
  const buckets = new Map<string, { bucket: HostBucket; rules: NotificationRule[] }>();
  for (const rule of rules) {
    const bucket = ruleHostBucket(rule, monitorsById);
    const entry = buckets.get(bucket.key);
    if (entry) {
      entry.rules.push(rule);
    } else {
      buckets.set(bucket.key, { bucket, rules: [rule] });
    }
  }
  return [...buckets.values()]
    .sort((a, b) => {
      const order = HOST_BUCKET_ORDER[a.bucket.kind] - HOST_BUCKET_ORDER[b.bucket.kind];
      if (order !== 0) return order;
      return a.bucket.label.localeCompare(b.bucket.label);
    })
    .map(
      ({ bucket, rules: bucketRules }) => [bucket, bucketRules] as [HostBucket, NotificationRule[]]
    );
}

export function AlertRules() {
  const [rules, setRules] = React.useState<NotificationRule[]>([]);
  const [monitors, setMonitors] = React.useState<Monitor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<NotificationRule | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<RuleFilter>("all");
  const [groupByHost, setGroupByHost] = React.useState(true);

  const monitorsById = React.useMemo(() => {
    const map = new Map<number, Monitor>();
    for (const monitor of monitors) map.set(monitor.id, monitor);
    return map;
  }, [monitors]);

  const refresh = React.useCallback(async () => {
    try {
      const [rulesList, monitorList] = await Promise.all([api.notificationRules(), api.monitors()]);
      setRules(rulesList);
      setMonitors(monitorList);
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not load alert rules"));
    }
  }, []);

  React.useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  function openNew() {
    setEditingRule(null);
    setEditorOpen(true);
  }

  function openEdit(rule: NotificationRule) {
    setEditingRule(rule);
    setEditorOpen(true);
  }

  async function save(input: NotificationRuleInput) {
    try {
      if (editingRule) {
        await api.updateNotificationRule(editingRule.id, input);
        toast.success("Alert rule updated");
      } else {
        await api.createNotificationRule(input);
        toast.success("Alert rule created");
      }
      setEditorOpen(false);
      setEditingRule(null);
      await refresh();
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not save alert rule"));
    }
  }

  async function toggleEnabled(rule: NotificationRule) {
    setBusyId(rule.id);
    try {
      await api.updateNotificationRule(rule.id, ruleToInput({ ...rule, enabled: !rule.enabled }));
      await refresh();
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not update alert rule"));
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(rule: NotificationRule) {
    setBusyId(rule.id);
    try {
      await api.createNotificationRule({
        name: `${rule.name} (copy)`,
        enabled: rule.enabled,
        monitor_ids: [...rule.monitor_ids],
        trigger_statuses: [...rule.trigger_statuses],
        threshold: rule.threshold,
        cooldown_minutes: rule.cooldown_minutes
      });
      toast.success(`Duplicated "${rule.name}"`);
      await refresh();
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not duplicate alert rule"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rule: NotificationRule) {
    if (!window.confirm(`Delete alert rule "${rule.name}"?`)) return;
    setBusyId(rule.id);
    try {
      await api.deleteNotificationRule(rule.id);
      toast.success("Alert rule deleted");
      await refresh();
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not delete alert rule"));
    } finally {
      setBusyId(null);
    }
  }

  const counts = React.useMemo(() => {
    let triggered = 0;
    let armed = 0;
    let paused = 0;
    for (const rule of rules) {
      const state = ruleState(rule);
      if (state === "triggered") triggered++;
      else if (state === "armed") armed++;
      else paused++;
    }
    return { all: rules.length, triggered, armed, paused };
  }, [rules]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rules.filter((rule) => {
      if (q && !rule.name.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      return ruleState(rule) === filter;
    });
    const stateOrder: Record<Exclude<RuleFilter, "all">, number> = {
      triggered: 0,
      armed: 1,
      paused: 2
    };
    return [...filtered].sort((a, b) => {
      const so = stateOrder[ruleState(a)] - stateOrder[ruleState(b)];
      if (so !== 0) return so;
      return a.name.localeCompare(b.name);
    });
  }, [rules, query, filter]);

  const hasFilters = query !== "" || filter !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert rules"
        description="Cross-monitor notifications — fire when N watched monitors hit a status (e.g. two PS5 listings back in stock). Works best when every monitor in a rule shares one host so it tracks a single retailer."
      >
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          New rule
        </Button>
      </PageHeader>

      {loading ? (
        <MonitorListSkeleton />
      ) : rules.length === 0 ? (
        <EmptyState message='No alert rules yet. Create one to be notified when conditions like "two monitors are in stock" are met.' />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 grow sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rules"
                aria-label="Search alert rules"
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {RULE_FILTERS.map((option) => {
                const active = filter === option.id;
                const count = counts[option.id];
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFilter(option.id)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <span>{option.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] font-medium tabular-nums",
                        active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <Toggle
              variant="outline"
              size="sm"
              pressed={groupByHost}
              onPressedChange={setGroupByHost}
              aria-label="Group by host"
              title="Group rules by the host they watch"
            >
              <Layers className="h-3.5 w-3.5" />
              Group by host
            </Toggle>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {visible.length === rules.length
                  ? `${rules.length} ${rules.length === 1 ? "rule" : "rules"}`
                  : `${visible.length} of ${rules.length} shown`}
              </span>
              {hasFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState message="No rules match the current filters." />
          ) : groupByHost ? (
            <div className="space-y-6">
              {groupVisibleByHost(visible, monitorsById).map(([bucket, items]) => (
                <section key={bucket.key} className="space-y-2">
                  <RuleGroupHeader bucket={bucket} count={items.length} />
                  <div className="grid gap-3">
                    {items.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        monitorsById={monitorsById}
                        totalMonitors={monitors.length}
                        busy={busyId === rule.id}
                        onEdit={() => openEdit(rule)}
                        onToggle={() => void toggleEnabled(rule)}
                        onDuplicate={() => void duplicate(rule)}
                        onDelete={() => void remove(rule)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {visible.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  monitorsById={monitorsById}
                  totalMonitors={monitors.length}
                  busy={busyId === rule.id}
                  onEdit={() => openEdit(rule)}
                  onToggle={() => void toggleEnabled(rule)}
                  onDuplicate={() => void duplicate(rule)}
                  onDelete={() => void remove(rule)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingRule ? "Edit alert rule" : "New alert rule"}</DialogTitle>
            <DialogDescription>
              Notify via ntfy when a condition across one or more monitors is satisfied.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 py-4">
            <AlertRuleEditor
              key={editingRule?.id ?? "new"}
              initial={editingRule}
              monitors={monitors}
              onSubmit={(input) => void save(input)}
            />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button form="alert-rule-form" type="submit">
              {editingRule ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleCard({
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
                monitor{scopeSize === 1 ? "" : "s"} {statusText}
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{hint}</div>
          </div>
          <div className="hidden text-right text-[11px] text-muted-foreground sm:block">
            Threshold {rule.threshold} of {scopeText}
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
  children: React.ReactNode;
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

function RuleGroupHeader({ bucket, count }: { bucket: HostBucket; count: number }) {
  const isMixed = bucket.kind === "mixed";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b pb-1.5",
        isMixed ? "border-amber-300/50" : "border-border/60"
      )}
    >
      <HostBucketIcon kind={bucket.kind} />
      <h3
        className={cn(
          "font-mono text-sm",
          isMixed ? "text-amber-700 dark:text-amber-300" : "text-foreground"
        )}
      >
        {bucket.label}
      </h3>
      <span className="text-xs text-muted-foreground">
        · {count} {count === 1 ? "rule" : "rules"}
      </span>
      {isMixed ? (
        <Tooltip>
          <TooltipTrigger
            aria-label="About mixed-host rules"
            className="ml-1 inline-flex items-center text-amber-700 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:text-amber-300"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs whitespace-normal text-left">
            These rules watch monitors from multiple hosts ({bucket.hosts.join(", ")}). Alerts work
            best when every monitor in a rule shares one retailer so the rule reasons about a single
            source of stock.
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
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

function HostBucketIcon({ kind }: { kind: HostBucket["kind"] }) {
  if (kind === "mixed") {
    return (
      <AlertTriangle
        className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
    );
  }
  if (kind === "all") {
    return <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
  }
  return <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
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

function RuleMonitorList({
  rule,
  monitorsById
}: {
  rule: NotificationRule;
  monitorsById: Map<number, Monitor>;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (rule.monitor_ids.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Watching <span className="font-medium text-foreground">all monitors</span>
      </p>
    );
  }

  const MAX_VISIBLE = 5;
  // Sort matching monitors first so the most relevant chips show before the overflow.
  const orderedIds = [...rule.monitor_ids].sort((a, b) => {
    const am = rule.current_matching_monitor_ids.includes(a) ? 0 : 1;
    const bm = rule.current_matching_monitor_ids.includes(b) ? 0 : 1;
    return am - bm;
  });
  const visibleIds = expanded ? orderedIds : orderedIds.slice(0, MAX_VISIBLE);
  const overflow = orderedIds.length - visibleIds.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">Watching</span>
      {visibleIds.map((id) => {
        const monitor = monitorsById.get(id);
        if (!monitor) {
          return (
            <Badge key={id} variant="outline" className="rounded-full text-[11px]">
              #{id} missing
            </Badge>
          );
        }
        const matching = rule.current_matching_monitor_ids.includes(id);
        return (
          <Link
            key={id}
            to={`/monitors/${id}`}
            title={monitor.url}
            className={cn(
              "inline-flex max-w-48 items-center gap-1 truncate rounded-full border px-2 py-0.5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              matching
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border-border text-muted-foreground"
            )}
          >
            {matching ? <span aria-hidden>✓</span> : null}
            <span className="truncate">{monitor.name}</span>
          </Link>
        );
      })}
      {overflow > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          +{overflow} more
        </button>
      ) : expanded && orderedIds.length > MAX_VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Show less
        </button>
      ) : null}
    </div>
  );
}

function ruleToInput(rule: NotificationRule): NotificationRuleInput {
  return {
    name: rule.name,
    enabled: rule.enabled,
    monitor_ids: [...rule.monitor_ids],
    trigger_statuses: [...rule.trigger_statuses],
    threshold: rule.threshold,
    cooldown_minutes: rule.cooldown_minutes
  };
}
