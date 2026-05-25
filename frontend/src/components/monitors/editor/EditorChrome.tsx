import type React from "react";

import { cn } from "../../../lib/utils";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { CardDescription, CardTitle } from "../../ui/card";

export function SectionTitle({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
          {description ? <CardDescription className="mt-0.5">{description}</CardDescription> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SubSectionLabel({
  children,
  className,
  tooltip
}: {
  children: React.ReactNode;
  className?: string;
  tooltip?: React.ReactNode;
}) {
  if (tooltip) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {children}
        </p>
        <InfoTooltip side="right">{tooltip}</InfoTooltip>
      </div>
    );
  }
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}

export function StaticRuleField({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 text-sm font-medium md:col-span-2">
      <span>{label}</span>
      <div className="min-w-0 rounded-md border bg-background px-3 py-2">
        <p className="break-words font-mono text-sm text-foreground [overflow-wrap:anywhere]">
          {value}
        </p>
        <p className="mt-1 text-xs font-normal leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function StatusPill({
  tone,
  children
}: {
  tone: "success" | "warning" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "muted" && "bg-secondary text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}
