import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Layers,
  List,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Power,
  Search,
  Tag,
  Trash2,
  X
} from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { api } from "../api";
import { hostFromUrl } from "../components/monitors/editor/helpers";
import { type MonitorActionKind, MonitorActions } from "../components/monitors/MonitorActions";
import { MonitorListCard } from "../components/monitors/MonitorListCard";
import { MonitorScreenshot } from "../components/monitors/MonitorScreenshot";
import { NextCheckSummary } from "../components/monitors/NextCheckSummary";
import { NotificationsCell } from "../components/monitors/NotificationsCell";
import { ScheduleEditPopover } from "../components/monitors/ScheduleEditPopover";
import { StockEditPopover } from "../components/monitors/StockEditPopover";
import { EmptyState } from "../components/shared/EmptyState";
import { FilterMenu } from "../components/shared/FilterMenu";
import { LinkButton } from "../components/shared/LinkButton";
import { PageHeader } from "../components/shared/PageHeader";
import { MonitorListSkeleton } from "../components/shared/Skeletons";
import { TagChips } from "../components/shared/TagChips";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../components/ui/alert-dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Table, TableCell, TableHead } from "../components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import {
  errorMessage,
  failureTypeLabel,
  formatDate,
  statusBadgeClass,
  statusLabel,
  timeAgo
} from "../lib/format";
import { isCoolingDown, monitorCopyPayload } from "../lib/monitor";
import { cn } from "../lib/utils";
import type { Monitor } from "../types";

type SortKey = "name" | "status" | "stock" | "last_checked" | "next_check";
type SortDir = "asc" | "desc";
type GroupMode = "none" | "host" | "tag";

const UNTAGGED_LABEL = "Untagged";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "in_stock", label: "In stock" },
  { id: "low_stock", label: "Low stock" },
  { id: "out_of_stock", label: "Out of stock" },
  { id: "error", label: "Error" },
  { id: "challenge", label: "Challenge" },
  { id: "unknown", label: "Unknown" }
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];

const ENABLED_FILTERS = [
  { id: "all", label: "All" },
  { id: "enabled", label: "Active" },
  { id: "disabled", label: "Paused" },
  { id: "cooling", label: "Cooling" }
] as const;

type EnabledFilter = (typeof ENABLED_FILTERS)[number]["id"];

function stockSortValue(monitor: Monitor): number {
  if (monitor.stock_mode === "quantity") return monitor.last_quantity ?? -1;
  if (monitor.status === "in_stock") return 2;
  if (monitor.status === "low_stock") return 1;
  if (monitor.status === "out_of_stock") return 0;
  return -1;
}

function timeValue(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function pluralize(count: number): string {
  return `${count} ${count === 1 ? "monitor" : "monitors"}`;
}

export function Monitors() {
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
      return true;
    });
  }, [monitors, query, statusFilter, enabledFilter, tagFilter]);

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
    query !== "" || statusFilter !== "all" || enabledFilter !== "all" || tagFilter !== "all";
  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setEnabledFilter("all");
    setTagFilter("all");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitors"
        description="Every monitor, with status, schedule, stock trend, and controls."
      >
        <LinkButton to="/monitors/new">
          <Plus className="h-4 w-4" />
          New monitor
        </LinkButton>
      </PageHeader>

      {loading ? <MonitorListSkeleton /> : null}
      {!loading ? (
        <>
          <MonitorsToolbar
            query={query}
            onQueryChange={setQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            enabledFilter={enabledFilter}
            onEnabledFilterChange={setEnabledFilter}
            statusCounts={statusCounts}
            enabledCounts={enabledCounts}
            visibleCount={sorted.length}
            totalCount={monitors.length}
            hasFilters={hasFilters}
            onClear={clearFilters}
            groupMode={groupMode}
            onGroupModeChange={setGroupMode}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            tagOptions={tagOptions}
            tagCounts={tagCounts}
          />

          <div className="space-y-5 lg:hidden">
            {grouped
              ? grouped.map(([groupLabel, groupMonitors]) => (
                  <div key={groupLabel} className="space-y-3">
                    {groupMode === "tag" || groupMonitors.length > 1 ? (
                      <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                        {groupMode === "tag" ? (
                          <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
                        ) : null}
                        <span
                          className={cn("text-foreground", groupMode === "host" && "font-mono")}
                        >
                          {groupLabel}
                        </span>
                        <span>· {pluralize(groupMonitors.length)}</span>
                      </div>
                    ) : null}
                    <div className="grid gap-3">
                      {groupMonitors.map((monitor) => (
                        <MonitorListCard
                          key={monitor.id}
                          monitor={monitor}
                          busyActions={busyActions}
                          onAction={action}
                          onDuplicate={duplicate}
                          onPatch={patchMonitor}
                          selected={selected.has(monitor.id)}
                          onSelectedChange={(checked) => setSelectedFor(monitor.id, checked)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              : sorted.map((monitor) => (
                  <MonitorListCard
                    key={monitor.id}
                    monitor={monitor}
                    busyActions={busyActions}
                    onAction={action}
                    onDuplicate={duplicate}
                    onPatch={patchMonitor}
                    selected={selected.has(monitor.id)}
                    onSelectedChange={(checked) => setSelectedFor(monitor.id, checked)}
                  />
                ))}
            {!sorted.length ? (
              <EmptyState
                message={
                  monitors.length === 0
                    ? "No monitors configured."
                    : "No monitors match the current filters."
                }
              />
            ) : null}
          </div>

          <Card className="hidden min-w-0 overflow-hidden rounded-md border border-border py-0 shadow-sm ring-0 lg:block">
            <CardContent className="p-0">
              <Table className="table-fixed">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <TableHead className="w-10 pl-4">
                      <Checkbox
                        checked={allVisibleSelected}
                        indeterminate={someVisibleSelected}
                        onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                        aria-label="Select all monitors"
                      />
                    </TableHead>
                    <TableHead className="w-20">Preview</TableHead>
                    <SortableHead
                      label="Monitor"
                      sortKey="name"
                      activeKey={sortKey}
                      direction={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableHead
                      label="Status"
                      className="w-32"
                      sortKey="status"
                      activeKey={sortKey}
                      direction={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableHead
                      label="Stock"
                      className="w-28"
                      sortKey="stock"
                      activeKey={sortKey}
                      direction={sortDir}
                      onClick={toggleSort}
                    />
                    <TableHead className="w-32">Notifications</TableHead>
                    <SortableHead
                      label="Last check"
                      className="w-32"
                      sortKey="last_checked"
                      activeKey={sortKey}
                      direction={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableHead
                      label="Next check"
                      className="w-40"
                      sortKey="next_check"
                      activeKey={sortKey}
                      direction={sortDir}
                      onClick={toggleSort}
                    />
                    <TableHead className="w-32 pr-4 text-right">Actions</TableHead>
                  </tr>
                </thead>
                {grouped ? (
                  grouped.map(([groupLabel, groupMonitors]) => (
                    <tbody key={groupLabel} className="not-first-of-type:border-t">
                      {groupMode === "tag" || groupMonitors.length > 1 ? (
                        <tr className="bg-muted/40">
                          <TableCell
                            colSpan={9}
                            className="px-4 py-1.5 text-xs font-medium text-muted-foreground"
                          >
                            <div className="flex items-center gap-2">
                              {groupMode === "tag" ? (
                                <Tag
                                  className="h-3 w-3 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span
                                className={cn(
                                  "text-foreground",
                                  groupMode === "host" && "font-mono"
                                )}
                              >
                                {groupLabel}
                              </span>
                              <span className="text-muted-foreground">
                                · {pluralize(groupMonitors.length)}
                              </span>
                            </div>
                          </TableCell>
                        </tr>
                      ) : null}
                      {groupMonitors.map((monitor) => (
                        <MonitorRow
                          key={monitor.id}
                          monitor={monitor}
                          busyActions={busyActions}
                          onAction={action}
                          onDuplicate={duplicate}
                          onPatch={patchMonitor}
                          selected={selected.has(monitor.id)}
                          onSelectedChange={(checked) => setSelectedFor(monitor.id, checked)}
                        />
                      ))}
                    </tbody>
                  ))
                ) : (
                  <tbody>
                    {sorted.map((monitor) => (
                      <MonitorRow
                        key={monitor.id}
                        monitor={monitor}
                        busyActions={busyActions}
                        onAction={action}
                        onDuplicate={duplicate}
                        onPatch={patchMonitor}
                        selected={selected.has(monitor.id)}
                        onSelectedChange={(checked) => setSelectedFor(monitor.id, checked)}
                      />
                    ))}
                  </tbody>
                )}
                {!sorted.length ? (
                  <tbody>
                    <tr>
                      <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                        {monitors.length === 0
                          ? "No monitors configured."
                          : "No monitors match the current filters."}
                      </TableCell>
                    </tr>
                  </tbody>
                ) : null}
              </Table>
            </CardContent>
          </Card>

          {selectedMonitors.length > 0 ? (
            <BulkActionBar
              count={selectedMonitors.length}
              busy={bulkBusy}
              onEnable={() => bulkSetEnabled(true)}
              onPause={() => bulkSetEnabled(false)}
              onRun={bulkRun}
              onDelete={bulkDelete}
              onClear={() => setSelected(new Set())}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function MonitorsToolbar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  enabledFilter,
  onEnabledFilterChange,
  statusCounts,
  enabledCounts,
  visibleCount,
  totalCount,
  hasFilters,
  onClear,
  groupMode,
  onGroupModeChange,
  tagFilter,
  onTagFilterChange,
  tagOptions,
  tagCounts
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  enabledFilter: EnabledFilter;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  statusCounts: Record<string, number>;
  enabledCounts: Record<"all" | "enabled" | "disabled" | "cooling", number>;
  visibleCount: number;
  totalCount: number;
  hasFilters: boolean;
  onClear: () => void;
  groupMode: GroupMode;
  onGroupModeChange: (value: GroupMode) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  tagOptions: { id: string; label: string }[];
  tagCounts: Record<string, number>;
}) {
  const countLabel =
    visibleCount === totalCount
      ? `${totalCount} ${totalCount === 1 ? "monitor" : "monitors"}`
      : `${visibleCount} of ${totalCount}`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="w-full min-w-0 sm:w-72">
        <InputGroup className="h-8">
          <InputGroupInput
            aria-label="Search monitors"
            placeholder="Search by name or URL"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <InputGroupAddon align="inline-start">
            <Search className="text-muted-foreground" aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="flex items-center gap-2">
        <FilterMenu
          label="Status"
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={onStatusFilterChange}
          counts={statusCounts}
        />
        <FilterMenu
          label="Activity"
          options={ENABLED_FILTERS}
          value={enabledFilter}
          onChange={onEnabledFilterChange}
          counts={enabledCounts}
        />
        {tagOptions.length > 1 ? (
          <FilterMenu
            label="Tag"
            options={tagOptions}
            value={tagFilter}
            onChange={onTagFilterChange}
            counts={tagCounts}
          />
        ) : null}
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X />
            Clear
          </Button>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 sm:ml-auto sm:justify-start">
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{countLabel}</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[groupMode]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) onGroupModeChange(next as GroupMode);
          }}
          aria-label="Monitor view"
        >
          <ToggleGroupItem value="none" aria-label="Flat list" title="Flat list">
            <List />
            List
          </ToggleGroupItem>
          <ToggleGroupItem value="host" aria-label="Group by host" title="Group by host">
            <Layers />
            Host
          </ToggleGroupItem>
          <ToggleGroupItem value="tag" aria-label="Group by tag" title="Group by tag">
            <Tag />
            Tag
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
  className
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDir;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-50")} aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function MonitorRow({
  monitor,
  busyActions,
  onAction,
  onDuplicate,
  onPatch,
  selected,
  onSelectedChange
}: {
  monitor: Monitor;
  busyActions: Record<number, MonitorActionKind>;
  onAction: (
    monitorId: number,
    kind: MonitorActionKind,
    fn: () => Promise<Monitor>
  ) => Promise<void>;
  onDuplicate: (monitor: Monitor) => Promise<void>;
  onPatch: (updated: Monitor) => void;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const cooling = isCoolingDown(monitor);
  const isQuantity = monitor.stock_mode === "quantity";
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        "align-middle data-selected:bg-primary/5",
        !monitor.enabled && "opacity-60 hover:opacity-100"
      )}
    >
      <TableCell className="w-10 py-2 pl-4">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
          aria-label={`Select ${monitor.name}`}
        />
      </TableCell>
      <TableCell className="w-20 py-2">
        <MonitorScreenshot monitor={monitor} compact />
      </TableCell>
      <TableCell className="min-w-0 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <Link
              to={`/monitors/${monitor.id}`}
              className="block truncate font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {monitor.name}
            </Link>
            <div className="truncate text-xs text-muted-foreground">{monitor.url}</div>
            <TagChips tags={monitor.tags} className="mt-1" />
          </div>
          {monitor.last_error ? (
            <Tooltip>
              <TooltipTrigger
                aria-label="Last error"
                className="inline-flex shrink-0 rounded-full text-amber-600 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:text-amber-400"
              >
                <AlertTriangle className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm whitespace-normal text-left">
                <div className="font-medium">
                  {monitor.last_error_type
                    ? failureTypeLabel(monitor.last_error_type)
                    : "Last error"}
                </div>
                <div className="mt-1 text-xs">{monitor.last_error}</div>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="w-32 py-2">
        <div className="flex flex-col gap-0.5">
          <Badge className={cn(statusBadgeClass(monitor.status), "w-fit")}>
            {statusLabel(monitor.status)}
          </Badge>
          {cooling ? (
            <span className="text-[11px] leading-tight text-violet-700 dark:text-violet-300">
              Cooling {timeAgo(monitor.cooldown_until)}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="w-28 py-2">
        <StockCell monitor={monitor} isQuantity={isQuantity} onPatch={onPatch} />
      </TableCell>
      <TableCell className="w-32 py-2">
        <NotificationsCell monitor={monitor} onSaved={onPatch} />
      </TableCell>
      <TableCell className="w-32 py-2 text-sm">
        {monitor.last_checked_at ? (
          <Tooltip>
            <TooltipTrigger className="cursor-default text-left">
              {timeAgo(monitor.last_checked_at) || "Just now"}
            </TooltipTrigger>
            <TooltipContent side="top">{formatDate(monitor.last_checked_at)}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">Never</span>
        )}
      </TableCell>
      <TableCell className="w-40 min-w-0 py-2 text-sm">
        <ScheduleEditPopover monitor={monitor} onSaved={onPatch}>
          <NextCheckSummary monitor={monitor} cooling={cooling} />
        </ScheduleEditPopover>
      </TableCell>
      <TableCell className="w-32 py-2 pr-4">
        <div className="flex justify-end">
          <MonitorActions
            monitor={monitor}
            busyActions={busyActions}
            onAction={onAction}
            onDuplicate={onDuplicate}
            compact
          />
        </div>
      </TableCell>
    </tr>
  );
}

function StockCell({
  monitor,
  isQuantity,
  onPatch
}: {
  monitor: Monitor;
  isQuantity: boolean;
  onPatch: (updated: Monitor) => void;
}) {
  if (!isQuantity) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <StockEditPopover monitor={monitor} onSaved={onPatch}>
      <div className="min-w-0 leading-tight">
        <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {monitor.last_quantity != null ? monitor.last_quantity.toLocaleString() : "—"}
        </div>
        {monitor.low_stock_threshold != null ? (
          <div className="text-[11px] text-muted-foreground">≤ {monitor.low_stock_threshold}</div>
        ) : null}
      </div>
    </StockEditPopover>
  );
}

function BulkActionBar({
  count,
  busy,
  onEnable,
  onPause,
  onRun,
  onDelete,
  onClear
}: {
  count: number;
  busy: "enable" | "pause" | "run" | "delete" | null;
  onEnable: () => void;
  onPause: () => void;
  onRun: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const anyBusy = busy !== null;
  const label = `${count} ${count === 1 ? "monitor" : "monitors"}`;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <section
        aria-label="Bulk actions"
        className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1.5 pl-3 shadow-lg"
      >
        <span className="text-sm font-medium tabular-nums">{label} selected</span>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <Button variant="ghost" size="sm" disabled={anyBusy} onClick={onEnable}>
          {busy === "enable" ? <LoaderCircle className="animate-spin" /> : <Power />}
          Enable
        </Button>
        <Button variant="ghost" size="sm" disabled={anyBusy} onClick={onPause}>
          {busy === "pause" ? <LoaderCircle className="animate-spin" /> : <Pause />}
          Pause
        </Button>
        <Button variant="ghost" size="sm" disabled={anyBusy} onClick={onRun}>
          {busy === "run" ? <LoaderCircle className="animate-spin" /> : <Play />}
          Run now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={anyBusy}
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
        >
          {busy === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
          Delete
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={anyBusy}
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X />
        </Button>
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected monitors and their check history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Delete {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
