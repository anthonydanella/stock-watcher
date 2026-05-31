import type React from "react";

export function SectionHeader({
  id,
  title,
  children
}: {
  id: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-3.5 w-1 rounded-full bg-gradient-to-b from-primary to-primary/30"
        />
        <h2
          id={id}
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
