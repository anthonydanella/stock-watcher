import React from "react";

import {
  ALERT_STATUSES,
  type AlertStatus,
  type Monitor,
  type NotificationRule,
  type NotificationRuleInput
} from "../../types";
import { FormField, NumberField, ToggleField } from "../shared/FormFields";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { AlertMonitorScope } from "./AlertMonitorScope";
import { TriggerStatusPicker } from "./TriggerStatusPicker";

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

  const monitorCountForThreshold = scopeMode === "all" ? monitors.length : draft.monitor_ids.length;
  const thresholdMax = Math.max(1, monitorCountForThreshold);

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

      <TriggerStatusPicker value={draft.trigger_statuses} onToggle={toggleStatus} />

      <AlertMonitorScope
        monitors={monitors}
        scopeMode={scopeMode}
        onScopeModeChange={setScopeMode}
        selectedIds={draft.monitor_ids}
        onSelectedIdsChange={(ids) => patch({ monitor_ids: ids })}
      />

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
