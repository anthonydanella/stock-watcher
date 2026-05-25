import { CheckCircle2, ShieldAlert } from "lucide-react";
import { successAlertClass, warningAlertClass } from "../../../lib/format";
import { Alert } from "../../ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import type { ValidationIssue } from "./helpers";

export function MonitorEditorSidebar({ validation }: { validation: ValidationIssue[] }) {
  if (!validation.length) {
    return (
      <Alert className={successAlertClass}>
        <CheckCircle2 className="h-4 w-4" />
        Configuration looks ready to save.
      </Alert>
    );
  }

  const errorCount = validation.filter((issue) => issue.tone === "error").length;
  const warningCount = validation.length - errorCount;

  return (
    <Card className="rounded-md border border-border shadow-sm ring-0">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Validation</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          {errorCount > 0 ? `${errorCount} issue${errorCount === 1 ? "" : "s"} block saving` : null}
          {errorCount > 0 && warningCount > 0 ? " · " : null}
          {warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : null}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {validation.map((issue) => (
          <Alert
            key={issue.message}
            variant={issue.tone === "error" ? "destructive" : undefined}
            className={issue.tone === "warning" ? warningAlertClass : undefined}
          >
            {issue.message}
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
}
