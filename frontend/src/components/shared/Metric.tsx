import type React from "react";

export function Metric({
  title,
  value,
  icon
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="text-muted-foreground/70">{icon}</span>
      <span>{title}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}
