import React from "react";
import { toast } from "sonner";

import { api } from "../api";
import { hostFromUrl } from "../components/monitors/editor/helpers";
import {
  type EnabledFilter,
  type GroupMode,
  type SortDir,
  type SortKey,
  type StatusFilter,
  UNTAGGED_LABEL
} from "../components/monitors/list/constants";
import { pluralize, stockSortValue, timeValue } from "../components/monitors/list/helpers";
import type { MonitorActionKind } from "../components/monitors/MonitorActions";
import { errorMessage } from "../lib/format";
import { isCoolingDown, monitorCopyPayload } from "../lib/monitor";
import type { Monitor } from "../types";

export function useMonitorList() {
  const [monitors, setMonitors] = React.useState<Monitor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyActions, setBusyActions] = React.useState<Record<number, MonitorActionKind>>({});
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [enabledFilter, setEnabledFilter] = React.useState<EnabledFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [groupMode, setGroupMode] = React.useState<GroupMode>("host");
  const [tagFilter, setTagFilter] = React.useState<string>("all");
  const [hostFilter, setHostFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = React.useState<"enable" | "pause" | "run" | "delete" | null>(
    null
  );

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setMonitors(await api.monitors());
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not load monitors"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  function patchMonitor(updated: Monitor) {
    setMonitors((current) =>
      current.map((monitor) => (monitor.id === updated.id ? updated : monitor))
    );
  }

  async function action(monitorId: number, kind: MonitorActionKind, fn: () => Promise<Monitor>) {
    setBusyActions((current) => ({ ...current, [monitorId]: kind }));
    try {
      patchMonitor(await fn());
    } catch (exc) {
      toast.error(errorMessage(exc, "Monitor action failed"));
    } finally {
      setBusyActions((current) => {
        const next = { ...current };
        delete next[monitorId];
        return next;
      });
    }
  }

  async function duplicate(monitor: Monitor) {
    setBusyActions((current) => ({ ...current, [monitor.id]: "duplicate" }));
    try {
      const created = await api.createMonitor(monitorCopyPayload(monitor));
      setMonitors((current) => [...current, created]);
      toast.success(`Duplicated as "${created.name}"`);
    } catch (exc) {
      toast.error(errorMessage(exc, "Could not duplicate monitor"));
    } finally {
      setBusyActions((current) => {
        const next = { ...current };
        delete next[monitor.id];
        return next;
      });
    }
  }

  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: monitors.length };
    for (const monitor of monitors) {
      const key = monitor.status || "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [monitors]);

  const enabledCounts = React.useMemo(() => {
    let enabled = 0;
    let disabled = 0;
    let cooling = 0;
    for (const monitor of monitors) {
      if (!monitor.enabled) disabled++;
      else if (isCoolingDown(monitor)) cooling++;
      else enabled++;
    }
    return { all: monitors.length, enabled, disabled, cooling };
  }, [monitors]);

  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const monitor of monitors) {
      for (const tag of monitor.tags) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [monitors]);

  const tagCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: monitors.length };
    for (const monitor of monitors) {
      for (const tag of monitor.tags) counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return counts;
  }, [monitors]);

  const tagOptions = React.useMemo(
    () => [{ id: "all", label: "All tags" }, ...allTags.map((tag) => ({ id: tag, label: tag }))],
    [allTags]
  );

  const allHosts = React.useMemo(() => {
    const set = new Set<string>();
    for (const monitor of monitors) {
      const host = hostFromUrl(monitor.url);
      if (host) set.add(host);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [monitors]);

  const hostCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: monitors.length };
    for (const monitor of monitors) {
      const host = hostFromUrl(monitor.url);
      if (host) counts[host] = (counts[host] ?? 0) + 1;
    }
    return counts;
  }, [monitors]);

  const hostOptions = React.useMemo(
    () => [
      { id: "all", label: "All hosts" },
      ...allHosts.map((host) => ({ id: host, label: host }))
    ],
    [allHosts]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return monitors.filter((monitor) => {
      if (q && !monitor.name.toLowerCase().includes(q) && !monitor.url.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter !== "all" && (monitor.status || "unknown") !== statusFilter) {
        return false;
      }
      if (enabledFilter === "enabled" && (!monitor.enabled || isCoolingDown(monitor))) return false;
      if (enabledFilter === "disabled" && monitor.enabled) return false;
      if (enabledFilter === "cooling" && (!monitor.enabled || !isCoolingDown(monitor)))
        return false;
      if (tagFilter !== "all" && !monitor.tags.includes(tagFilter)) return false;
      if (hostFilter !== "all" && hostFromUrl(monitor.url) !== hostFilter) return false;
      return true;
    });
  }, [monitors, query, statusFilter, enabledFilter, tagFilter, hostFilter]);

  const sorted = React.useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;
    const list = [...filtered];
    list.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "name":
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case "status":
          av = a.status || "unknown";
          bv = b.status || "unknown";
          break;
        case "stock":
          av = stockSortValue(a);
          bv = stockSortValue(b);
          break;
        case "last_checked":
          av = timeValue(a.last_checked_at);
          bv = timeValue(b.last_checked_at);
          break;
        case "next_check":
          av = a.enabled
            ? timeValue(a.next_check_at) || Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER;
          bv = b.enabled
            ? timeValue(b.next_check_at) || Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER;
          break;
      }
      if (av < bv) return -1 * direction;
      if (av > bv) return 1 * direction;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const grouped = React.useMemo<[string, Monitor[]][] | null>(() => {
    if (groupMode === "none") return null;
    if (groupMode === "host") {
      const map = new Map<string, Monitor[]>();
      for (const monitor of sorted) {
        const host = hostFromUrl(monitor.url) || "(no host)";
        const list = map.get(host);
        if (list) list.push(monitor);
        else map.set(host, [monitor]);
      }
      return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    }
    // Group by tag: a monitor appears under each of its tags; untagged collect last.
    const map = new Map<string, Monitor[]>();
    const untagged: Monitor[] = [];
    for (const monitor of sorted) {
      if (!monitor.tags.length) {
        untagged.push(monitor);
        continue;
      }
      for (const tag of monitor.tags) {
        const list = map.get(tag);
        if (list) list.push(monitor);
        else map.set(tag, [monitor]);
      }
    }
    const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (untagged.length) entries.push([UNTAGGED_LABEL, untagged]);
    return entries;
  }, [sorted, groupMode]);

  const selectedMonitors = React.useMemo(
    () => monitors.filter((monitor) => selected.has(monitor.id)),
    [monitors, selected]
  );
  const allVisibleSelected = sorted.length > 0 && sorted.every((m) => selected.has(m.id));
  const someVisibleSelected = !allVisibleSelected && sorted.some((m) => selected.has(m.id));

  function setSelectedFor(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const monitor of sorted) {
        if (checked) next.add(monitor.id);
        else next.delete(monitor.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkSetEnabled(enabled: boolean) {
    // toggleMonitor flips state, so only act on rows that aren't already there.
    const targets = selectedMonitors.filter((m) => m.enabled !== enabled);
    if (!targets.length) {
      toast.info(`Selected monitors are already ${enabled ? "active" : "paused"}.`);
      return;
    }
    setBulkBusy(enabled ? "enable" : "pause");
    const results = await Promise.allSettled(targets.map((m) => api.toggleMonitor(m.id)));
    let failed = 0;
    for (const result of results) {
      if (result.status === "fulfilled") patchMonitor(result.value);
      else failed++;
    }
    setBulkBusy(null);
    if (failed) toast.error(`${failed} of ${targets.length} could not be updated.`);
    else toast.success(`${enabled ? "Enabled" : "Paused"} ${pluralize(targets.length)}.`);
  }

  async function bulkRun() {
    const targets = selectedMonitors;
    if (!targets.length) return;
    setBulkBusy("run");
    const results = await Promise.allSettled(targets.map((m) => api.runMonitor(m.id)));
    let failed = 0;
    for (const result of results) {
      if (result.status === "fulfilled") patchMonitor(result.value);
      else failed++;
    }
    setBulkBusy(null);
    if (failed) toast.error(`${failed} of ${targets.length} runs failed.`);
    else toast.success(`Ran ${pluralize(targets.length)}.`);
  }

  async function bulkDelete() {
    const targets = selectedMonitors;
    if (!targets.length) return;
    setBulkBusy("delete");
    const results = await Promise.allSettled(
      targets.map((m) => api.deleteMonitor(m.id).then(() => m.id))
    );
    const deleted = new Set<number>();
    let failed = 0;
    for (const result of results) {
      if (result.status === "fulfilled") deleted.add(result.value);
      else failed++;
    }
    setMonitors((current) => current.filter((m) => !deleted.has(m.id)));
    setSelected(new Set());
    setBulkBusy(null);
    if (failed) toast.error(`${failed} of ${targets.length} could not be deleted.`);
    else toast.success(`Deleted ${pluralize(targets.length)}.`);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "last_checked" ? "desc" : "asc");
    }
  }

  const hasFilters =
    query !== "" ||
    statusFilter !== "all" ||
    enabledFilter !== "all" ||
    tagFilter !== "all" ||
    hostFilter !== "all";
  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setEnabledFilter("all");
    setTagFilter("all");
    setHostFilter("all");
  }

  return {
    monitors,
    loading,
    busyActions,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    enabledFilter,
    setEnabledFilter,
    sortKey,
    sortDir,
    toggleSort,
    groupMode,
    setGroupMode,
    tagFilter,
    setTagFilter,
    hostFilter,
    setHostFilter,
    statusCounts,
    enabledCounts,
    tagOptions,
    tagCounts,
    hostOptions,
    hostCounts,
    sorted,
    grouped,
    selected,
    selectedMonitors,
    allVisibleSelected,
    someVisibleSelected,
    setSelectedFor,
    toggleSelectAllVisible,
    clearSelection,
    bulkBusy,
    bulkSetEnabled,
    bulkRun,
    bulkDelete,
    patchMonitor,
    action,
    duplicate,
    hasFilters,
    clearFilters
  };
}
