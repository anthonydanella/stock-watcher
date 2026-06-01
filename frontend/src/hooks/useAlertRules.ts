import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { toast } from "sonner";

import { api } from "../api";
import { ruleState, ruleToInput } from "../components/alerts/helpers";
import type { RuleFilter } from "../components/alerts/types";
import { errorMessage } from "../lib/format";
import { monitorsQuery, notificationRulesQuery, queryKeys } from "../lib/queries";
import type { Monitor, NotificationRule, NotificationRuleInput } from "../types";
import { useQueryErrorToast } from "./useQueryErrorToast";

export function useAlertRules() {
  const queryClient = useQueryClient();
  const rulesQ = useQuery(notificationRulesQuery());
  const monitorsQ = useQuery(monitorsQuery());
  useQueryErrorToast(
    rulesQ.isError || monitorsQ.isError,
    rulesQ.error ?? monitorsQ.error,
    "Could not load alert rules"
  );
  const rules = rulesQ.data ?? [];
  const monitors = React.useMemo(() => monitorsQ.data ?? [], [monitorsQ.data]);
  const loading = rulesQ.isPending || monitorsQ.isPending;

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

  // Rule mutations only change rules, so revalidate that key; the monitor list
  // is owned elsewhere and stays cached.
  const refresh = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.notificationRules }),
    [queryClient]
  );

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

  function clearFilters() {
    setQuery("");
    setFilter("all");
  }

  return {
    rules,
    monitors,
    monitorsById,
    loading,
    editorOpen,
    setEditorOpen,
    editingRule,
    busyId,
    query,
    setQuery,
    filter,
    setFilter,
    groupByHost,
    setGroupByHost,
    counts,
    visible,
    hasFilters,
    clearFilters,
    openNew,
    openEdit,
    save,
    toggleEnabled,
    duplicate,
    remove
  };
}
