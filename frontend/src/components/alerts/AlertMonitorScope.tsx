import { AlertTriangle, Search } from "lucide-react";
import React from "react";

import { statusBadgeClass, statusLabel } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { Monitor } from "../../types";
import { hostFromUrl } from "../monitors/editor/helpers";
import { InfoTooltip } from "../shared/InfoTooltip";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";

export function AlertMonitorScope({
  monitors,
  scopeMode,
  onScopeModeChange,
  selectedIds,
  onSelectedIdsChange
}: {
  monitors: Monitor[];
  scopeMode: "all" | "specific";
  onScopeModeChange: (mode: "all" | "specific") => void;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
}) {
  const [monitorQuery, setMonitorQuery] = React.useState("");

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
    for (const id of selectedIds) {
      const monitor = byId.get(id);
      if (!monitor) continue;
      const host = hostFromUrl(monitor.url);
      if (host) set.add(host);
    }
    return [...set].sort();
  }, [selectedIds, monitors, scopeMode]);

  function toggleMonitor(id: number, checked: boolean) {
    const current = new Set(selectedIds);
    if (checked) current.add(id);
    else current.delete(id);
    onSelectedIdsChange([...current]);
  }

  function selectAllVisible() {
    const ids = new Set(selectedIds);
    for (const monitor of filteredMonitors) ids.add(monitor.id);
    onSelectedIdsChange([...ids]);
  }

  function clearVisible() {
    if (!filteredMonitors.length) return;
    const visibleIds = new Set(filteredMonitors.map((monitor) => monitor.id));
    onSelectedIdsChange(selectedIds.filter((id) => !visibleIds.has(id)));
  }

  return (
    <fieldset className="min-w-0 space-y-3 rounded-md border bg-background p-3">
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Watch monitors
        <InfoTooltip>
          Pick which monitors are evaluated. "All monitors" includes monitors created later
          automatically. For best results, keep every monitor in a rule on the same host so the rule
          reasons about a single retailer's stock.
        </InfoTooltip>
      </legend>
      <div className="flex flex-wrap gap-2">
        <ScopeButton
          label="All monitors"
          active={scopeMode === "all"}
          onClick={() => onScopeModeChange("all")}
        />
        <ScopeButton
          label="Specific monitors"
          active={scopeMode === "specific"}
          onClick={() => onScopeModeChange("specific")}
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
                {selectedIds.length} selected
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
                    !filteredMonitors.some((monitor) => selectedIds.includes(monitor.id))
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
                  const checked = selectedIds.includes(monitor.id);
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
                        <div className="truncate text-xs text-muted-foreground">{monitor.url}</div>
                      </div>
                      <Badge className={cn("shrink-0", statusBadgeClass(monitor.status))}>
                        {statusLabel(monitor.status)}
                      </Badge>
                    </label>
                  );
                })
              )}
            </div>
            {selectedIds.length === 0 ? (
              <p className="text-xs text-warning-accent">
                Select at least one monitor, or switch to "All monitors".
              </p>
            ) : null}
            {selectedHosts.length > 1 ? (
              <div className="flex items-start gap-2 rounded-md border border-warning-strong bg-warning-subtle px-2.5 py-2 text-xs text-warning">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-vivid"
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
