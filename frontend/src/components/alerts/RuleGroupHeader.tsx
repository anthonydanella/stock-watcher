import { AlertTriangle, Globe, Layers } from "lucide-react";

import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type { HostBucket } from "./types";

export function RuleGroupHeader({ bucket, count }: { bucket: HostBucket; count: number }) {
  const isMixed = bucket.kind === "mixed";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b pb-1.5",
        isMixed ? "border-warning-strong" : "border-border/60"
      )}
    >
      <HostBucketIcon kind={bucket.kind} />
      <h3 className={cn("font-mono text-sm", isMixed ? "text-warning-accent" : "text-foreground")}>
        {bucket.label}
      </h3>
      <span className="text-xs text-muted-foreground">
        · {count} {count === 1 ? "rule" : "rules"}
      </span>
      {isMixed ? (
        <Tooltip>
          <TooltipTrigger
            aria-label="About mixed-host rules"
            className="ml-1 inline-flex items-center link-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs whitespace-normal text-left">
            These rules watch monitors from multiple hosts ({bucket.hosts.join(", ")}). Alerts work
            best when every monitor in a rule shares one retailer so the rule reasons about a single
            source of stock.
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function HostBucketIcon({ kind }: { kind: HostBucket["kind"] }) {
  if (kind === "mixed") {
    return <AlertTriangle className="h-3.5 w-3.5 text-warning-vivid" aria-hidden="true" />;
  }
  if (kind === "all") {
    return <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
  }
  return <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
}
