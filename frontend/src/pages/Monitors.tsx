import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Layers,
  Plus,
  Search,
  X
} from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { api } from "../api";
import { hostFromUrl } from "../components/monitors/editor/helpers";
import { type MonitorActionKind, MonitorActions } from "../components/monitors/MonitorActions";
import { MonitorListCard } from "../components/monitors/MonitorListCard";
import { MonitorQuantitySparkline } from "../components/monitors/MonitorQuantitySparkline";
import { MonitorScreenshot } from "../components/monitors/MonitorScreenshot";
import { EmptyState } from "../components/shared/EmptyState";
import { LinkButton } from "../components/shared/LinkButton";
import { PageHeader } from "../components/shared/PageHeader";
import { MonitorListSkeleton } from "../components/shared/Skeletons";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TableCell, TableHead } from "../components/ui/table";
import { Toggle } from "../components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import {
  errorMessage,
  failureTypeLabel,
  formatCadence,
  formatDate,
  formatScheduleState,
  statusBadgeClass,
  statusLabel,
  timeAgo
} from "../lib/format";
import { monitorCopyPayload } from "../lib/monitor";
import { cn } from "../lib/utils";
import type { Monitor } from "../types";

type SortKey = "name" | "status" | "stock" | "last_checked" | "next_check";
type SortDir = "asc" | "desc";

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

function isCoolingDown(monitor: Monitor) {
  if (!monitor.cooldown_until) return false;
  const t = new Date(monitor.cooldown_until).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

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

export function Monitors() {
  const [monitors, setMonitors] = React.useState<Monitor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyActions, setBusyActions] = React.useState<Record<number, MonitorActionKind>>({});
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [enabledFilter, setEnabledFilter] = React.useState<EnabledFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [groupByHost, setGroupByHost] = React.useState(true);

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
      return true;
    });
  }, [monitors, query, statusFilter, enabledFilter]);

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

  const grouped = React.useMemo(() => {
    if (!groupByHost) return null;
    const map = new Map<string, Monitor[]>();
    for (const monitor of sorted) {
      const host = hostFromUrl(monitor.url) || "(no host)";
      const list = map.get(host);
      if (list) list.push(monitor);
      else map.set(host, [monitor]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sorted, groupByHost]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "last_checked" ? "desc" : "asc");
    }
  }

  const hasFilters = query !== "" || statusFilter !== "all" || enabledFilter !== "all";
  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setEnabledFilter("all");
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
            groupByHost={groupByHost}
            onGroupByHostChange={setGroupByHost}
          />

          <div className="grid gap-3 lg:hidden">
            {sorted.map((monitor) => (
              <MonitorListCard
                key={monitor.id}
                monitor={monitor}
                busyActions={busyActions}
                onAction={action}
                onDuplicate={duplicate}
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
                    <TableHead className="w-24 pl-4">Preview</TableHead>
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
                      className="w-36"
                      sortKey="stock"
                      activeKey={sortKey}
                      direction={sortDir}
                      onClick={toggleSort}
                    />
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
                  grouped.map(([host, hostMonitors]) => (
                    <tbody key={host} className="not-first-of-type:border-t">
                      <tr className="bg-muted/40">
                        <TableCell
                          colSpan={7}
                          className="px-4 py-1.5 text-xs font-medium text-muted-foreground"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-foreground">{host}</span>
                            <span className="text-muted-foreground">
                              · {hostMonitors.length}{" "}
                              {hostMonitors.length === 1 ? "monitor" : "monitors"}
                            </span>
                          </div>
                        </TableCell>
                      </tr>
                      {hostMonitors.map((monitor) => (
                        <MonitorRow
                          key={monitor.id}
                          monitor={monitor}
                          busyActions={busyActions}
                          onAction={action}
                          onDuplicate={duplicate}
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
                      />
                    ))}
                  </tbody>
                )}
                {!sorted.length ? (
                  <tbody>
                    <tr>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
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
  groupByHost,
  onGroupByHostChange
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
  groupByHost: boolean;
  onGroupByHostChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 grow sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by name or URL"
            aria-label="Search monitors"
            className="pl-8"
          />
        </div>
        <ToggleGroup
          value={[enabledFilter]}
          onValueChange={(value) => {
            const next = value[value.length - 1];
            if (next) onEnabledFilterChange(next as EnabledFilter);
          }}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Filter by activity"
        >
          {ENABLED_FILTERS.map((option) => (
            <ToggleGroupItem key={option.id} value={option.id}>
              {option.label}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {enabledCounts[option.id]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle
          variant="outline"
          size="sm"
          pressed={groupByHost}
          onPressedChange={onGroupByHostChange}
          aria-label="Group by host"
          title="Group by host"
        >
          <Layers className="h-3.5 w-3.5" />
          Group by host
        </Toggle>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {visibleCount === totalCount
              ? `${totalCount} ${totalCount === 1 ? "monitor" : "monitors"}`
              : `${visibleCount} of ${totalCount} shown`}
          </span>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((option) => {
          const active = statusFilter === option.id;
          const count = statusCounts[option.id] ?? 0;
          if (option.id !== "all" && count === 0 && !active) return null;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onStatusFilterChange(option.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              aria-pressed={active}
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
  onDuplicate
}: {
  monitor: Monitor;
  busyActions: Record<number, MonitorActionKind>;
  onAction: (
    monitorId: number,
    kind: MonitorActionKind,
    fn: () => Promise<Monitor>
  ) => Promise<void>;
  onDuplicate: (monitor: Monitor) => Promise<void>;
}) {
  const cooling = isCoolingDown(monitor);
  const isQuantity = monitor.stock_mode === "quantity";
  return (
    <tr className={cn("align-middle", !monitor.enabled && "opacity-60 hover:opacity-100")}>
      <TableCell className="w-24 py-2 pl-4">
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
      <TableCell className="w-36 py-2">
        <StockCell monitor={monitor} isQuantity={isQuantity} />
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
      <TableCell className="w-40 py-2 text-sm">
        <div className="leading-tight">{formatScheduleState(monitor, true)}</div>
        <div className="text-xs leading-tight text-muted-foreground">
          {formatCadence(monitor.interval_seconds, monitor.jitter_percent)}
        </div>
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

function StockCell({ monitor, isQuantity }: { monitor: Monitor; isQuantity: boolean }) {
  if (!isQuantity) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const trend = monitor.recent_quantities ?? [];
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 leading-tight">
        <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {monitor.last_quantity != null ? monitor.last_quantity.toLocaleString() : "—"}
        </div>
        {monitor.low_stock_threshold != null ? (
          <div className="text-[11px] text-muted-foreground">≤ {monitor.low_stock_threshold}</div>
        ) : null}
      </div>
      {trend.length > 1 ? (
        <MonitorQuantitySparkline
          values={trend}
          threshold={monitor.low_stock_threshold}
          className="ml-auto shrink-0"
        />
      ) : null}
    </div>
  );
}
