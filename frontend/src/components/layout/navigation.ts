import { cn } from "../../lib/utils";

export function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "relative rounded-md px-2 py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    // Tab-style underline: the ::after bar scales in from the center when a link
    // becomes active. The same node persists across route changes, so toggling
    // scale-x animates the swap between the old and new active item.
    "after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-primary after:transition-transform after:duration-200 after:ease-out after:content-['']",
    isActive ? "text-foreground after:scale-x-100" : "text-muted-foreground after:scale-x-0"
  );
}
