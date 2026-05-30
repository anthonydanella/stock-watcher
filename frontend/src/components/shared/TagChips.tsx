import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

export function TagChips({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="max-w-48 font-normal">
          <span className="truncate">{tag}</span>
        </Badge>
      ))}
    </div>
  );
}
