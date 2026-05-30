import { statusBadgeClass } from "../../../lib/format";
import type { RuleLabResult } from "../../../types";
import { Badge } from "../../ui/badge";
import { CodeBlock, EmptyPanel } from "./LabPrimitives";

export function ElementsPanel({ diagnostics }: { diagnostics: RuleLabResult["diagnostics"] }) {
  if (!diagnostics) return <EmptyPanel message="The rule was not evaluated." />;
  if (!diagnostics.elements.length) return <EmptyPanel message="No matched elements were found." />;
  return (
    <div className="space-y-3">
      {diagnostics.elements.map((element) => (
        <div key={element.index} className="rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusBadgeClass("unknown")}>#{element.index}</Badge>
            <span className="font-mono text-sm">&lt;{element.tag}&gt;</span>
            {Object.entries(element.attributes).map(([key, value]) => (
              <span
                key={key}
                className="inline-block max-w-full truncate rounded bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground"
              >
                {key}="{value}"
              </span>
            ))}
          </div>
          <p className="mt-3 break-words text-sm">{element.value || element.text || "-"}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              HTML
            </summary>
            <CodeBlock value={element.html} className="mt-2" />
          </details>
        </div>
      ))}
    </div>
  );
}
