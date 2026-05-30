import React from "react";
import { Link } from "react-router-dom";

import { cn } from "../../lib/utils";
import type { Monitor, NotificationRule } from "../../types";
import { Badge } from "../ui/badge";

export function RuleMonitorList({
  rule,
  monitorsById
}: {
  rule: NotificationRule;
  monitorsById: Map<number, Monitor>;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (rule.monitor_ids.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Watching <span className="font-medium text-foreground">all monitors</span>
      </p>
    );
  }

  const MAX_VISIBLE = 5;
  // Sort matching monitors first so the most relevant chips show before the overflow.
  const orderedIds = [...rule.monitor_ids].sort((a, b) => {
    const am = rule.current_matching_monitor_ids.includes(a) ? 0 : 1;
    const bm = rule.current_matching_monitor_ids.includes(b) ? 0 : 1;
    return am - bm;
  });
  const visibleIds = expanded ? orderedIds : orderedIds.slice(0, MAX_VISIBLE);
  const overflow = orderedIds.length - visibleIds.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">Watching</span>
      {visibleIds.map((id) => {
        const monitor = monitorsById.get(id);
        if (!monitor) {
          return (
            <Badge key={id} variant="outline" className="rounded-full text-[11px]">
              #{id} missing
            </Badge>
          );
        }
        const matching = rule.current_matching_monitor_ids.includes(id);
        return (
          <Link
            key={id}
            to={`/monitors/${id}`}
            title={monitor.url}
            className={cn(
              "inline-flex max-w-48 items-center gap-1 truncate rounded-full border px-2 py-0.5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              matching
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border-border text-muted-foreground"
            )}
          >
            {matching ? <span aria-hidden>✓</span> : null}
            <span className="truncate">{monitor.name}</span>
          </Link>
        );
      })}
      {overflow > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          +{overflow} more
        </button>
      ) : expanded && orderedIds.length > MAX_VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Show less
        </button>
      ) : null}
    </div>
  );
}
