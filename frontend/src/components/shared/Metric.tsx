import type React from "react";

import { Card, CardContent } from "../ui/card";

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
    <Card className="min-w-0 rounded-md border border-border shadow-sm ring-0">
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-md bg-secondary p-2 text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}
