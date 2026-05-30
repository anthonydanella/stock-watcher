import { AlertTriangle, Search } from "lucide-react";
import React from "react";
import { statusBadgeClass, statusLabel } from "../../lib/format";
import { cn } from "../../lib/utils";
import {
  ALERT_STATUSES,
  type AlertStatus,
  type Monitor,
  type NotificationRule,
  type NotificationRuleInput
} from "../../types";
import { hostFromUrl } from "../monitors/editor/helpers";
import { FormField, NumberField, ToggleField } from "../shared/FormFields";
import { InfoTooltip } from "../shared/InfoTooltip";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const STATUS_DESCRIPTIONS: Record<AlertStatus, string> = {
  in_stock: "Item is available",
  low_stock: "Quantity below the low-stock threshold",
  out_of_stock: "Item is sold out",
  error: "Check failed",
  challenge: "CAPTCHA or bot challenge detected",
  unknown: "Never checked or status unclear"
};

const DEFAULT_INPUT: NotificationRuleInput = {
  name: "",
  enabled: true,
  monitor_ids: [],
  trigger_statuses: ["in_stock"],
  threshold: 1,
  cooldown_minutes: 60
};

export function AlertRuleEditor({
  initial,
  monitors,
  onSubmit
}: {
  initial: NotificationRule | null;
  monitors: Monitor[];
  onSubmit: (input: NotificationRuleInput) => void;
}) {
  const [draft, setDraft] = React.useState<NotificationRuleInput>(() =>
    initial
      ? {
          name: initial.name,
          enabled: initial.enabled,
          monitor_ids: [...initial.monitor_ids],
          trigger_statuses: [...initial.trigger_statuses],
          threshold: initial.threshold,
          cooldown_minutes: initial.cooldown_minutes
        }
      : DEFAULT_INPUT
  );
  const [scopeMode, setScopeModeState] = React.useState<"all" | "specific">(() =>
    initial && initial.monitor_ids.length > 0 ? "specific" : "all"
  );
  const [monitorQuery, setMonitorQuery] = React.useState("");

  const monitorCountForThreshold = scopeMode === "all" ? monitors.length : draft.monitor_ids.length;
  const thresholdMax = Math.max(1, monitorCountForThreshold);

  const filteredMonitors = React.useMemo(() => {
    const q = monitorQuery.trim().toLowerCase();
    if (!q) return monitors;
    return monitors.filter(
      (monitor) => monitor.name.toLowerCase().includes(q) || monitor.url.toLowerCase().includes(q)
    );
  }, [monitors, monitorQuery]);

  const selectedHosts = React.useMemo(() => {
    if (scopeMode !== "specific") return [];
    const set = new Set<string>();
    const byId = new Map(monitors.map((monitor) => [monitor.id, monitor]));
    for (const id of draft.monitor_ids) {
      const monitor = byId.get(id);
      if (!monitor) continue;
      const host = hostFromUrl(monitor.url);
      if (host) set.add(host);
    }
    return [...set].sort();
  }, [draft.monitor_ids, monitors, scopeMode]);

  function patch(next: Partial<NotificationRuleInput>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function toggleStatus(status: AlertStatus, checked: boolean) {
    const current = new Set(draft.trigger_statuses);
    if (checked) current.add(status);
    else current.delete(status);
    const next = ALERT_STATUSES.filter((value) => current.has(value));
    patch({ trigger_statuses: next.length === 0 ? draft.trigger_statuses : next });
  }

  function setScopeMode(mode: "all" | "specific") {
    setScopeModeState(mode);
    if (mode === "all") {
      patch({ monitor_ids: [] });
    }
  }

  function toggleMonitor(id: number, checked: boolean) {
    const current = new Set(draft.monitor_ids);
    if (checked) current.add(id);
    else current.delete(id);
    patch({ monitor_ids: [...current] });
  }

  function selectAllVisible() {
    const ids = new Set(draft.monitor_ids);
    for (const monitor of filteredMonitors) ids.add(monitor.id);
    patch({ monitor_ids: [...ids] });
  }

  function clearVisible() {
    if (!filteredMonitors.length) return;
    const visibleIds = new Set(filteredMonitors.map((monitor) => monitor.id));
    patch({ monitor_ids: draft.monitor_ids.filter((id) => !visibleIds.has(id)) });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    if (scopeMode === "specific" && draft.monitor_ids.length === 0) return;
    onSubmit({
      ...draft,
      name: draft.name.trim(),
      threshold: Math.max(1, Math.min(draft.threshold, thresholdMax)),
      monitor_ids: [...draft.monitor_ids]
    });
  }

  const summary = buildSummary(draft, monitors.length);

  return (
    <form id="alert-rule-form" className="space-y-5" onSubmit={handleSubmit}>
      <FormField label="Rule name">
        <Input
          autoFocus
          placeholder='e.g. "Two GPUs back in stock"'
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          required
        />
      </FormField>

      <ToggleField
        label="Enable this rule"
        description="When off, the rule is paused. Conditions are tracked but no notifications are sent."
        checked={draft.enabled}
        onCheckedChange={(checked) => patch({ enabled: checked })}
      />

      <fieldset className="min-w-0 space-y-3 rounded-md border bg-background p-3">
        <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Trigger when status is
          <InfoTooltip>
            The rule looks at the live status of every monitor in scope and counts the ones in any
            of the selected statuses.
          </InfoTooltip>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ALERT_STATUSES.map((status) => {
            const checked = draft.trigger_statuses.includes(status);
            const inputId = `alert-status-${status}`;
            return (
              <label
                key={status}
                htmlFor={inputId}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  checked ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent/40"
                )}
              >
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={(value) => toggleStatus(status, Boolean(value))}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge className={statusBadgeClass(status)}>{statusLabel(status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {STATUS_DESCRIPTIONS[status]}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-3 rounded-md border bg-background p-3">
        <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Watch monitors
          <InfoTooltip>
            Pick which monitors are evaluated. "All monitors" includes monitors created later
            automatically. For best results, keep every monitor in a rule on the same host so the
            rule reasons about a single retailer's stock.
          </InfoTooltip>
        </legend>
        <div className="flex flex-wrap gap-2">
          <ScopeButton
            label="All monitors"
            active={scopeMode === "all"}
            onClick={() => setScopeMode("all")}
          />
          <ScopeButton
            label="Specific monitors"
            active={scopeMode === "specific"}
            onClick={() => setScopeMode("specific")}
          />
        </div>
        {scopeMode === "specific" ? (
          monitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No monitors yet. Create one first, then come back to scope this rule.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 grow sm:max-w-xs">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={monitorQuery}
                    onChange={(event) => setMonitorQuery(event.target.value)}
                    placeholder="Filter monitors"
                    aria-label="Filter monitors"
                    className="h-8 pl-7 text-sm"
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {draft.monitor_ids.length} selected
                  {monitorQuery && filteredMonitors.length !== monitors.length
                    ? ` · ${filteredMonitors.length} of ${monitors.length} shown`
                    : ""}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAllVisible}
                    disabled={filteredMonitors.length === 0}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearVisible}
                    disabled={
                      filteredMonitors.length === 0 ||
                      !filteredMonitors.some((monitor) => draft.monitor_ids.includes(monitor.id))
                    }
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border bg-card p-2">
                {filteredMonitors.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No monitors match this filter.
                  </p>
                ) : (
                  filteredMonitors.map((monitor) => {
                    const checked = draft.monitor_ids.includes(monitor.id);
                    const inputId = `alert-monitor-${monitor.id}`;
                    return (
                      <label
                        key={monitor.id}
                        htmlFor={inputId}
                        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
                      >
                        <Checkbox
                          id={inputId}
                          checked={checked}
                          onCheckedChange={(value) => toggleMonitor(monitor.id, Boolean(value))}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{monitor.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {monitor.url}
                          </div>
                        </div>
                        <Badge className={cn("shrink-0", statusBadgeClass(monitor.status))}>
                          {statusLabel(monitor.status)}
                        </Badge>
                      </label>
                    );
                  })
                )}
              </div>
              {draft.monitor_ids.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Select at least one monitor, or switch to "All monitors".
                </p>
              ) : null}
              {selectedHosts.length > 1 ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p>
                      You've picked monitors across{" "}
                      <span className="font-medium">{selectedHosts.length} hosts</span> (
                      <span className="font-mono">{selectedHosts.join(", ")}</span>).
                    </p>
                    <p>
                      Alerts work best when every watched monitor shares the same host so the rule
                      reasons about one retailer's stock. Consider splitting this into one rule per
                      host.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Threshold"
          description={`Trigger when this many monitors in scope match (max ${thresholdMax}).`}
          value={draft.threshold}
          min={1}
          max={thresholdMax || undefined}
          onChange={(value) => patch({ threshold: value })}
        />
        <NumberField
          label="Cooldown (minutes)"
          description="Suppress repeat triggers within this many minutes. Use 0 to fire on every transition."
          value={draft.cooldown_minutes}
          min={0}
          max={10080}
          onChange={(value) => patch({ cooldown_minutes: value })}
        />
      </div>

      <div className="rounded-md border border-dashed bg-secondary/40 p-3 text-sm">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plain English
        </Label>
        <p className="mt-1 [overflow-wrap:anywhere]">{summary}</p>
      </div>
    </form>
  );
}

function ScopeButton({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-accent/40"
      )}
    >
      {label}
    </button>
  );
}

function buildSummary(draft: NotificationRuleInput, totalMonitors: number): string {
  const statuses = draft.trigger_statuses.map((status) => status.replace(/_/g, " "));
  const statusText =
    statuses.length === 0
      ? "matching"
      : statuses.length === 1
        ? statuses[0]
        : statuses.length === 2
          ? `${statuses[0]} or ${statuses[1]}`
          : `${statuses.slice(0, -1).join(", ")}, or ${statuses[statuses.length - 1]}`;
  const scope =
    draft.monitor_ids.length === 0
      ? `all monitors${totalMonitors ? ` (${totalMonitors})` : ""}`
      : `${draft.monitor_ids.length} selected monitor${draft.monitor_ids.length === 1 ? "" : "s"}`;
  const cooldown =
    draft.cooldown_minutes > 0
      ? `, then wait ${draft.cooldown_minutes} minute${draft.cooldown_minutes === 1 ? "" : "s"} before re-firing.`
      : ".";
  return `Notify when ${draft.threshold} or more of ${scope} ${statuses.length === 1 ? "is" : "are"} ${statusText}${cooldown}`;
}
