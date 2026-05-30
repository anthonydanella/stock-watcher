import type { HostBucket, RuleFilter } from "./types";

export const RULE_FILTERS: { id: RuleFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "triggered", label: "Triggered" },
  { id: "armed", label: "Armed" },
  { id: "paused", label: "Paused" }
];

export const HOST_BUCKET_ORDER: Record<HostBucket["kind"], number> = {
  single: 0,
  all: 1,
  mixed: 2,
  unknown: 3
};
