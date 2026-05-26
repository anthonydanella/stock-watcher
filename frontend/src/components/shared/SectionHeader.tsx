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
      <h2 id={id} className="text-sm font-semibold uppercase text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}
