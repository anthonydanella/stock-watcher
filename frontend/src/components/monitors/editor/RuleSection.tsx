import { SearchCheck, Wand2 } from "lucide-react";
import React from "react";

import { api } from "../../../api";
import type { Monitor } from "../../../types";
import { FormField } from "../../shared/FormFields";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader } from "../../ui/card";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { ChoiceGrid } from "./ChoiceGrid";
import { rulePresets, ruleTypes, stockModes } from "./constants";
import { SectionTitle, StaticRuleField, SubSectionLabel } from "./EditorChrome";
import {
  existsDescription,
  type matchModesForRule,
  matchPlaceholder,
  operandDescription,
  operandLabel,
  ruleSummary,
  targetDescription,
  targetLabel,
  targetPlaceholder
} from "./helpers";
import { RuleSuggester } from "./RuleSuggester";
import type { MonitorPatch } from "./types";

export function RuleSection({
  monitor,
  ruleType,
  matchMode,
  matchValueDisabled,
  availableMatchModes,
  onPatch,
  onPatchMany,
  onApplyRuleType,
  onApplyMatchMode
}: {
  monitor: Partial<Monitor>;
  ruleType: Monitor["rule_type"];
  matchMode: Monitor["match_mode"];
  matchValueDisabled: boolean;
  availableMatchModes: ReturnType<typeof matchModesForRule>;
  onPatch: MonitorPatch;
  onPatchMany: (values: Partial<Monitor>) => void;
  onApplyRuleType: (ruleType: Monitor["rule_type"]) => void;
  onApplyMatchMode: (matchMode: Monitor["match_mode"]) => void;
}) {
  const stockMode = monitor.stock_mode ?? "binary";
  const [llmConfigured, setLlmConfigured] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    api
      .settings()
      .then((settings) => {
        if (!cancelled) setLlmConfigured(Boolean(settings.llm_configured && settings.llm_model));
      })
      .catch(() => {
        if (!cancelled) setLlmConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="rounded-md border border-border shadow-sm ring-0">
      <CardHeader>
        <SectionTitle
          icon={SearchCheck}
          title="Stock detection"
          description="How to read the page and decide whether the product is available."
        />
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <SubSectionLabel tooltip="Binary: the monitor is 'in stock' or 'out of stock' based on whether a text or CSS rule passes. Quantity: extracts a number from the page and tracks it over time — useful for inventory counts and countdown timers.">
            Mode
          </SubSectionLabel>
          <ChoiceGrid
            label=""
            value={stockMode}
            choices={stockModes}
            onChange={(value) => onPatch("stock_mode", value)}
            columns="three"
          />
        </section>

        <section className="space-y-3">
          <SubSectionLabel>Quick start</SubSectionLabel>
          <RuleSuggester
            monitor={monitor}
            configured={llmConfigured}
            onApply={(suggestion) => {
              const patch: Partial<Monitor> = {
                stock_mode: suggestion.stock_mode,
                rule_type: suggestion.rule_type,
                selector_or_path: suggestion.selector_or_path,
                match_mode: suggestion.match_mode,
                match_value: suggestion.match_value,
                quantity_pattern: suggestion.quantity_pattern,
                low_stock_threshold: suggestion.low_stock_threshold
              };
              onPatchMany(patch);
            }}
          />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden />
            <span>or pick a preset</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rulePresets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPatchMany(preset.patch)}
              >
                <Wand2 className="h-3.5 w-3.5" />
                {preset.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <SubSectionLabel tooltip="Text body scans the full page text (optionally scoped to a CSS element). CSS extract targets a specific element by selector — more precise, but requires knowing the page structure.">
            Where to look
          </SubSectionLabel>
          <ChoiceGrid
            label="Extractor"
            value={ruleType}
            choices={ruleTypes}
            onChange={onApplyRuleType}
            columns="three"
          />
          <FormField label={targetLabel(ruleType)} description={targetDescription(ruleType)}>
            <Input
              value={monitor.selector_or_path ?? ""}
              onChange={(event) => onPatch("selector_or_path", event.target.value)}
              placeholder={targetPlaceholder(ruleType)}
              required={ruleType === "css"}
            />
          </FormField>
        </section>

        <section className="space-y-4">
          <SubSectionLabel
            tooltip={
              stockMode === "binary"
                ? "Choose an assertion and an operand. The monitor is 'in stock' when the assertion holds against the extracted text."
                : "Provide a regex with one capture group (e.g. (\\d+)) to pull the stock number. Leave blank to grab the first integer found. The AI helper can write one from a plain-English description."
            }
          >
            {stockMode === "binary" ? "How to match" : "Quantity extraction"}
          </SubSectionLabel>
          {stockMode === "binary" ? (
            <>
              <ChoiceGrid
                label="Assertion"
                value={matchMode}
                choices={availableMatchModes}
                onChange={onApplyMatchMode}
                columns="three"
              />
              {matchValueDisabled ? (
                <StaticRuleField label="Operand" value="none" detail={existsDescription(monitor)} />
              ) : (
                <FormField
                  label={operandLabel(matchMode)}
                  description={operandDescription(matchMode)}
                >
                  <Textarea
                    className="font-mono"
                    value={monitor.match_value ?? ""}
                    onChange={(event) => onPatch("match_value", event.target.value)}
                    placeholder={matchPlaceholder(matchMode)}
                  />
                </FormField>
              )}
            </>
          ) : (
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
              <FormField
                label="Quantity regex"
                description="Use named groups: (?P<qty>…) captures the integer, (?P<oos>…) marks out-of-stock text and records the quantity as 0. Leave blank to grab the first number, or use Configure rule with AI above."
                tooltip={
                  <div className="space-y-1.5 text-xs leading-snug">
                    <p>
                      The pattern is matched case-insensitively, multiline. Inline flag groups like{" "}
                      <code className="font-mono">(?i)</code> are stripped automatically.
                    </p>
                    <p>
                      <span className="font-medium">qty</span> wins when it captures digits. If only{" "}
                      <span className="font-medium">oos</span> matches, the monitor records quantity
                      0 (out of stock).
                    </p>
                    <p className="font-mono text-[11px]">
                      (?P&lt;qty&gt;\d+)\s*left|(?P&lt;oos&gt;out\s*of\s*stock)
                    </p>
                    <p>
                      Scope to a container present in both states; avoid selectors tied to stock
                      state (<code className="font-mono">.sold-out</code>) since they vanish on the
                      flip. Let the regex's context words find the number.
                    </p>
                  </div>
                }
              >
                <Input
                  className="font-mono"
                  value={monitor.quantity_pattern ?? ""}
                  onChange={(event) => onPatch("quantity_pattern", event.target.value)}
                  placeholder="(\\d+)\\s*left"
                />
              </FormField>
              <FormField
                label="Low-stock threshold"
                description="Optional. Triggers the low-stock status at or below this value."
              >
                <Input
                  type="number"
                  min={0}
                  value={monitor.low_stock_threshold ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      onPatch("low_stock_threshold", null);
                    } else {
                      const parsed = Number.parseInt(raw, 10);
                      onPatch("low_stock_threshold", Number.isFinite(parsed) ? parsed : null);
                    }
                  }}
                  placeholder="e.g. 3"
                />
              </FormField>
            </div>
          )}
        </section>

        <div className="min-w-0 rounded-md border bg-secondary/40 p-3">
          <SubSectionLabel>Evaluation</SubSectionLabel>
          <p className="mt-1 break-words font-mono text-sm text-foreground [overflow-wrap:anywhere]">
            {ruleSummary(monitor)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
