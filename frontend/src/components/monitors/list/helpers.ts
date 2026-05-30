import type { Monitor } from "../../../types";

export function stockSortValue(monitor: Monitor): number {
  if (monitor.stock_mode === "quantity") return monitor.last_quantity ?? -1;
  if (monitor.status === "in_stock") return 2;
  if (monitor.status === "low_stock") return 1;
  if (monitor.status === "out_of_stock") return 0;
  return -1;
}

export function timeValue(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function pluralize(count: number): string {
  return `${count} ${count === 1 ? "monitor" : "monitors"}`;
}
