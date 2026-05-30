import { warningAlertClass } from "../../../lib/format";
import { Alert } from "../../ui/alert";
import type { ValidationIssue } from "./helpers";

/**
 * Full-width validation banner shown at the top of the monitor editor. Errors
 * block saving; warnings are advisory. Renders nothing when the configuration is
 * clean — the editor action bar carries the "ready to save" state instead.
 */
export function EditorValidation({ validation }: { validation: ValidationIssue[] }) {
  if (!validation.length) return null;
  return (
    <div className="space-y-2">
      {validation.map((issue) => (
        <Alert
          key={issue.message}
          variant={issue.tone === "error" ? "destructive" : undefined}
          className={issue.tone === "warning" ? warningAlertClass : undefined}
        >
          {issue.message}
        </Alert>
      ))}
    </div>
  );
}
