import type { RuleLabResult } from "../../../types";
import { Alert } from "../../ui/alert";
import { CodeBlock, EmptyPanel, LabMetric } from "./LabPrimitives";

export function RegexPanel({ diagnostics }: { diagnostics: RuleLabResult["diagnostics"] }) {
  if (!diagnostics) return <EmptyPanel message="The rule was not evaluated." />;
  if (!diagnostics.regex) return <EmptyPanel message="This assertion is not using regex." />;
  const regex = diagnostics.regex;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabMetric
          label="Valid"
          value={regex.valid ? "Yes" : "No"}
          tone={regex.valid ? "success" : "error"}
        />
        <LabMetric
          label="Matches"
          value={String(regex.match_count)}
          tone={regex.matched ? "success" : undefined}
        />
      </div>
      {regex.error ? <Alert variant="destructive">{regex.error}</Alert> : null}
      <CodeBlock value={regex.matches.length ? regex.matches.join("\n") : "No regex matches"} />
    </div>
  );
}
