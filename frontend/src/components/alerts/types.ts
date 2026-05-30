export type RuleFilter = "all" | "triggered" | "armed" | "paused";

export type HostBucket = {
  kind: "single" | "all" | "mixed" | "unknown";
  /** Stable key used for grouping & sorting. */
  key: string;
  /** Human-facing label. For single-host rules this is the bare hostname. */
  label: string;
  /** Unique sorted hosts the rule watches (empty for "all" / "unknown"). */
  hosts: string[];
};
