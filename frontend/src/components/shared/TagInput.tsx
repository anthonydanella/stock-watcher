import { X } from "lucide-react";
import React from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

export function TagInput({
  value,
  onChange,
  id,
  placeholder = "Add a tag and press Enter",
  suggestions = []
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = React.useState("");
  const listId = id ? `${id}-suggestions` : undefined;

  function addTag(raw: string) {
    const text = raw.trim();
    setDraft("");
    if (!text) return;
    if (value.some((tag) => tag.toLowerCase() === text.toLowerCase())) return;
    onChange([...value, text]);
  }

  function removeTag(tag: string) {
    onChange(value.filter((item) => item !== tag));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
    } else if (event.key === "Backspace" && !draft && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  const unusedSuggestions = suggestions.filter(
    (item) => !value.some((tag) => tag.toLowerCase() === item.toLowerCase())
  );

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          <span className="max-w-40 truncate">{tag}</span>
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => removeTag(tag)}
            className="-mr-0.5 inline-flex items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        list={listId}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(draft)}
        placeholder={value.length ? "" : placeholder}
        className={cn(
          "min-w-28 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        )}
      />
      {listId && unusedSuggestions.length > 0 ? (
        <datalist id={listId}>
          {unusedSuggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
