import type * as React from "react";

import { cn } from "../../lib/utils";
import { Card } from "../ui/card";

/**
 * Flat, bordered panel — a thinner, squarer alternative to the default elevated
 * Card used across the app's settings panels, editor sections, and data tables.
 * Composes Card so all Card subcomponents (CardHeader, CardContent, …) work as
 * usual; extra utility classes merge in via the `className` prop.
 */
export function PanelCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn("rounded-md border border-border shadow-sm ring-0", className)}
      {...props}
    />
  );
}
