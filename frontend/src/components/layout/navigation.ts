import { cn } from "../../lib/utils";

export function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-md px-2 py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
  );
}
