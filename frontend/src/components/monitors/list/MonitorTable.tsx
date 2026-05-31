import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Tag } from "lucide-react";
import { Link } from "react-router-dom";

import { failureTypeLabel, formatDate, timeAgo } from "../../../lib/format";
import { isCoolingDown } from "../../../lib/monitor";
import { cn } from "../../../lib/utils";
import type { Monitor } from "../../../types";
import { PanelCard } from "../../shared/PanelCard";
import { StatusBadge } from "../../shared/StatusBadge";
import { TagChips } from "../../shared/TagChips";
import { CardContent } from "../../ui/card";
import { Checkbox } from "../../ui/checkbox";
import { Table, TableCell, TableHead } from "../../ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { type MonitorActionKind, MonitorActions } from "../MonitorActions";
import { MonitorScreenshot } from "../MonitorScreenshot";
import { NextCheckSummary } from "../NextCheckSummary";
import { NotificationsCell } from "../NotificationsCell";
import { ScheduleEditPopover } from "../ScheduleEditPopover";
import { StockEditPopover } from "../StockEditPopover";
import type { GroupMode, SortDir, SortKey } from "./constants";
import { pluralize } from "./helpers";

export function MonitorTable({
  sorted,
  grouped,
  groupMode,
  totalCount,
  busyActions,
  onAction,
  onDuplicate,
  onPatch,
  selected,
  onSelectedChange,
  sortKey,
  sortDir,
  onToggleSort,
  allVisibleSelected,
  someVisibleSelected,
  onToggleSelectAllVisible
}: {
  sorted: Monitor[];
  grouped: [string, Monitor[]][] | null;
  groupMode: GroupMode;
  totalCount: number;
  busyActions: Record<number, MonitorActionKind>;
  onAction: (
    monitorId: number,
    kind: MonitorActionKind,
    fn: () => Promise<Monitor>
  ) => Promise<void>;
  onDuplicate: (monitor: Monitor) => Promise<void>;
  onPatch: (updated: Monitor) => void;
  selected: Set<number>;
  onSelectedChange: (id: number, checked: boolean) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onToggleSelectAllVisible: (checked: boolean) => void;
}) {
  const renderRow = (monitor: Monitor) => (
    <MonitorRow
      key={monitor.id}
      monitor={monitor}
      busyActions={busyActions}
      onAction={onAction}
      onDuplicate={onDuplicate}
      onPatch={onPatch}
      selected={selected.has(monitor.id)}
      onSelectedChange={(checked) => onSelectedChange(monitor.id, checked)}
    />
  );
  return (
    <PanelCard className="hidden min-w-0 overflow-hidden py-0 lg:block">
      <CardContent className="p-0">
        <Table className="table-fixed">
          <thead className="border-b bg-muted/30">
            <tr>
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  onCheckedChange={(checked) => onToggleSelectAllVisible(checked === true)}
                  aria-label="Select all monitors"
                />
              </TableHead>
              <TableHead className="w-24">Preview</TableHead>
              <SortableHead
                label="Monitor"
                sortKey="name"
                activeKey={sortKey}
                direction={sortDir}
                onClick={onToggleSort}
              />
              <SortableHead
                label="Status"
                className="w-32"
                sortKey="status"
                activeKey={sortKey}
                direction={sortDir}
                onClick={onToggleSort}
              />
              <SortableHead
                label="Stock"
                className="w-28"
                sortKey="stock"
                activeKey={sortKey}
                direction={sortDir}
                onClick={onToggleSort}
              />
              <TableHead className="w-32">Notifications</TableHead>
              <SortableHead
                label="Last check"
                className="w-32"
                sortKey="last_checked"
                activeKey={sortKey}
                direction={sortDir}
                onClick={onToggleSort}
              />
              <SortableHead
                label="Next check"
                className="w-40"
                sortKey="next_check"
                activeKey={sortKey}
                direction={sortDir}
                onClick={onToggleSort}
              />
              <TableHead className="w-40 pr-4 text-right">Actions</TableHead>
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
                          className={cn("text-foreground", groupMode === "host" && "font-mono")}
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
                {groupMonitors.map(renderRow)}
              </tbody>
            ))
          ) : (
            <tbody>{sorted.map(renderRow)}</tbody>
          )}
          {!sorted.length ? (
            <tbody>
              <tr>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  {totalCount === 0
                    ? "No monitors configured."
                    : "No monitors match the current filters."}
                </TableCell>
              </tr>
            </tbody>
          ) : null}
        </Table>
      </CardContent>
    </PanelCard>
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
      <TableCell className="w-24 py-2">
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
          <StatusBadge status={monitor.status} live={monitor.enabled} className="w-fit" />
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
      <TableCell className="w-40 py-2 pr-4">
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
