import { Bell, BellOff, Plus, Trash2 } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { api } from "../api";
import { AlertRuleEditor } from "../components/alerts/AlertRuleEditor";
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
import { errorMessage, formatDate, statusLabel, timeAgo } from "../lib/format";
import { cn } from "../lib/utils";
import type { Monitor, NotificationRule, NotificationRuleInput } from "../types";

export function AlertRules() {
  const [rules, setRules] = React.useState<NotificationRule[]>([]);
  const [monitors, setMonitors] = React.useState<Monitor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<NotificationRule | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert rules"
        description="Custom notifications that fire when a condition spans multiple monitors — e.g. when two of your watched products are in stock at once."
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
        <div className="grid gap-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              monitorsById={monitorsById}
              busy={busyId === rule.id}
              onEdit={() => openEdit(rule)}
              onToggle={() => void toggleEnabled(rule)}
              onDelete={() => void remove(rule)}
            />
          ))}
        </div>
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
  busy,
  onEdit,
  onToggle,
  onDelete
}: {
  rule: NotificationRule;
  monitorsById: Map<number, Monitor>;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const scopeText =
    rule.monitor_ids.length === 0
      ? "all monitors"
      : `${rule.monitor_ids.length} monitor${rule.monitor_ids.length === 1 ? "" : "s"}`;
  const statusText = rule.trigger_statuses.map(statusLabel).join(", ");
  const summary = `When ${rule.threshold} or more of ${scopeText} ${
    rule.trigger_statuses.length === 1 ? "is" : "are in"
  } ${statusText}`;

  return (
    <Card size="sm" className="rounded-md border border-border shadow-sm ring-0">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="text-left text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {rule.name}
            </button>
            {rule.enabled ? (
              rule.currently_satisfied ? (
                <Badge
                  variant="default"
                  className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  Triggered
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full">
                  Armed
                </Badge>
              )
            ) : (
              <Badge variant="secondary" className="rounded-full">
                Paused
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {rule.current_matching_count} matching now
            </span>
          </div>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{summary}.</p>
          <RuleMonitorList rule={rule} monitorsById={monitorsById} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Cooldown: {rule.cooldown_minutes > 0 ? `${rule.cooldown_minutes} min` : "none"}
            </span>
            {rule.last_triggered_at ? (
              <span title={formatDate(rule.last_triggered_at)}>
                Last triggered {timeAgo(rule.last_triggered_at)}
              </span>
            ) : (
              <span>Never triggered</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onToggle}
            title={rule.enabled ? "Pause this rule" : "Enable this rule"}
          >
            {rule.enabled ? (
              <>
                <BellOff className="h-3.5 w-3.5" />
                Pause
              </>
            ) : (
              <>
                <Bell className="h-3.5 w-3.5" />
                Enable
              </>
            )}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onDelete}
            aria-label={`Delete ${rule.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RuleMonitorList({
  rule,
  monitorsById
}: {
  rule: NotificationRule;
  monitorsById: Map<number, Monitor>;
}) {
  if (rule.monitor_ids.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Watching <span className="font-medium text-foreground">all monitors</span>.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Watching:</span>
      {rule.monitor_ids.map((id) => {
        const monitor = monitorsById.get(id);
        if (!monitor) {
          return (
            <Badge key={id} variant="outline" className="rounded-full">
              #{id} (missing)
            </Badge>
          );
        }
        const matching = rule.current_matching_monitor_ids.includes(id);
        return (
          <Link
            key={id}
            to={`/monitors/${id}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              matching
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "text-muted-foreground"
            )}
          >
            {matching ? <span aria-hidden>✓</span> : null}
            {monitor.name}
          </Link>
        );
      })}
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
