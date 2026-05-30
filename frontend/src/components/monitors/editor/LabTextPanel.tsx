import type { RuleLabResult } from "../../../types";
import { type EvidenceHighlightMode, EvidenceViewer } from "../../shared/EvidenceViewer";
import { EmptyPanel } from "./LabPrimitives";

export function TextPanel({ diagnostics }: { diagnostics: RuleLabResult["diagnostics"] }) {
  if (!diagnostics) return <EmptyPanel message="The rule was not evaluated." />;
  const extractedText = diagnostics.extracted_text || "";
  const regexError = diagnostics.regex && !diagnostics.regex.valid ? diagnostics.regex.error : "";
  const hasMatchContext = diagnostics.match_contexts.length > 0;
  const initialQuery = diagnostics.match_mode === "exists" ? "" : diagnostics.match_value;
  const initialMode: EvidenceHighlightMode = diagnostics.match_mode === "regex" ? "regex" : "text";
  const sourceSummary = diagnostics.extracted_text_is_excerpt
    ? hasMatchContext
      ? `Full extracted text is ${diagnostics.extracted_text_length.toLocaleString()} characters; showing the area around the rule match.`
      : `Full extracted text is ${diagnostics.extracted_text_length.toLocaleString()} characters; showing a shortened excerpt.`
    : "";
  const primaryLabel = diagnostics.extracted_text_is_excerpt
    ? hasMatchContext
      ? "Matched excerpt"
      : "Extracted text excerpt"
    : "Extracted text";

  return (
    <EvidenceViewer
      value={extractedText}
      fields={[
        { label: "Source", value: sourceSummary },
        { label: "Regex error", value: regexError, tone: "error" }
      ]}
      primaryLabel={primaryLabel}
      emptyMessage={textEmptyMessage(diagnostics)}
      initialQuery={initialQuery}
      initialMode={initialMode}
      searchPlaceholder="Search extracted text"
    />
  );
}

function textEmptyMessage(diagnostics: NonNullable<RuleLabResult["diagnostics"]>) {
  if (diagnostics.selector_or_path.trim())
    return "The selector matched no readable text for this rule.";
  return "No readable text was extracted from the response.";
}
