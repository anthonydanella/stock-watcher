import { Tag } from "lucide-react";

import { cn } from "../../../lib/utils";
import type { Monitor } from "../../../types";
import { EmptyState } from "../../shared/EmptyState";
import type { MonitorActionKind } from "../MonitorActions";
import { MonitorListCard } from "../MonitorListCard";
import type { GroupMode } from "./constants";
import { pluralize } from "./helpers";

export function MonitorCardList({
  grouped,
  groupMode,
  sorted,
  totalCount,
  busyActions,
  onAction,
  onDuplicate,
  onPatch,
  selected,
  onSelectedChange
}: {
  grouped: [string, Monitor[]][] | null;
  groupMode: GroupMode;
  sorted: Monitor[];
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
}) {
  const renderCard = (monitor: Monitor) => (
    <MonitorListCard
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
    <div className="space-y-5 lg:hidden">
      {grouped
        ? grouped.map(([groupLabel, groupMonitors]) => (
            <div key={groupLabel} className="space-y-3">
              {groupMode === "tag" || groupMonitors.length > 1 ? (
                <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                  {groupMode === "tag" ? (
                    <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className={cn("text-foreground", groupMode === "host" && "font-mono")}>
                    {groupLabel}
                  </span>
                  <span>· {pluralize(groupMonitors.length)}</span>
                </div>
              ) : null}
              <div className="grid gap-3">{groupMonitors.map(renderCard)}</div>
            </div>
          ))
        : sorted.map(renderCard)}
      {!sorted.length ? (
        <EmptyState
          message={
            totalCount === 0 ? "No monitors configured." : "No monitors match the current filters."
          }
        />
      ) : null}
    </div>
  );
}
