export type SortKey = "name" | "status" | "stock" | "last_checked" | "next_check";
export type SortDir = "asc" | "desc";
export type GroupMode = "none" | "host" | "tag";

export const UNTAGGED_LABEL = "Untagged";

export const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "in_stock", label: "In stock" },
  { id: "low_stock", label: "Low stock" },
  { id: "out_of_stock", label: "Out of stock" },
  { id: "error", label: "Error" },
  { id: "challenge", label: "Challenge" },
  { id: "unknown", label: "Unknown" }
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];

export const ENABLED_FILTERS = [
  { id: "all", label: "All" },
  { id: "enabled", label: "Active" },
  { id: "disabled", label: "Paused" },
  { id: "cooling", label: "Cooling" }
] as const;

export type EnabledFilter = (typeof ENABLED_FILTERS)[number]["id"];
