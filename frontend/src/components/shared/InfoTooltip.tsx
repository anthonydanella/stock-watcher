import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function InfoTooltip({
  children,
  side = "top"
}: {
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="More information"
        className="inline-flex cursor-help items-center rounded-full text-muted-foreground/70 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <Info className="h-3.5 w-3.5" />
      </TooltipTrigger>
      <TooltipContent side={side}>{children}</TooltipContent>
    </Tooltip>
  );
}
