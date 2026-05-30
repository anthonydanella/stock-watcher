import { Timer } from "lucide-react";
import React from "react";
import type { Monitor } from "../../../types";
import { FormField } from "../../shared/FormFields";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader } from "../../ui/card";
import { Input } from "../../ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../ui/input-group";
import { Label } from "../../ui/label";
import { ChoiceGrid } from "./ChoiceGrid";
import { CHROME_DESKTOP_UA, schedulePresets, userAgentPresets } from "./constants";
import { SectionTitle, SubSectionLabel } from "./EditorChrome";
import type { MonitorPatch } from "./types";

const DURATION_UNIT_FACTORS: Record<string, number> = {
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1
};

const DURATION_TOKEN = /(\d+(?:\.\d+)?)\s*([a-z]+)?/gi;

function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // A bare number is treated as minutes — the natural unit for stock checks.
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Math.round(Number(trimmed) * 60));
  }
  let total = 0;
  let matched = false;
  for (const m of trimmed.matchAll(DURATION_TOKEN)) {
    const n = Number(m[1]);
    const factor = m[2] ? DURATION_UNIT_FACTORS[m[2].toLowerCase()] : undefined;
    if (!Number.isFinite(n) || factor == null) return null;
    total += n * factor;
    matched = true;
  }
  return matched ? Math.round(total) : null;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds == null || seconds <= 0) return "";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function IntervalInput({
  label,
  value,
  minSeconds,
  onChange
}: {
  label: string;
  value?: number;
  minSeconds: number;
  onChange: (seconds: number) => void;
}) {
  const id = React.useId();
  const [raw, setRaw] = React.useState(() => formatDuration(value));

  // One-way parent→child sync: reset display when the parent value changes to
  // something the current text doesn't represent (preset clicks, save reset).
  // biome-ignore lint/correctness/useExhaustiveDependencies: depending on `raw` would loop
  React.useEffect(() => {
    if (parseDuration(raw) === value) return;
    setRaw(formatDuration(value));
  }, [value]);

  return (
    <div className="grid gap-2 text-sm font-medium">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <InfoTooltip>
          Type a duration like 30s, 5m, 1h, or 1h30m. A bare number is read as minutes.
        </InfoTooltip>
      </div>
      <Input
        id={id}
        type="text"
        inputMode="text"
        value={raw}
        aria-label={label}
        placeholder="5m"
        onChange={(event) => setRaw(event.target.value)}
        onBlur={() => {
          const parsed = parseDuration(raw);
          if (parsed != null && parsed >= minSeconds) {
            onChange(parsed);
            setRaw(formatDuration(parsed));
          } else {
            setRaw(formatDuration(value));
          }
        }}
      />
    </div>
  );
}

function NumberWithUnit({
  label,
  tooltip,
  value,
  unit,
  min,
  max,
  onChange,
  ariaLabel
}: {
  label: string;
  tooltip?: string;
  value?: number;
  unit: string;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
}) {
  const id = React.useId();
  const [raw, setRaw] = React.useState(value == null ? "" : String(value));

  // Sync internal string when the parent's value changes to something the
  // current input doesn't already represent (preset clicks, save reset).
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-way parent→child sync; reacting to `raw` would loop
  React.useEffect(() => {
    const parsed = Number(raw);
    if (raw !== "" && Number.isFinite(parsed) && parsed === value) return;
    setRaw(value == null ? "" : String(value));
  }, [value]);

  return (
    <div className="grid gap-2 text-sm font-medium">
      {tooltip ? (
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <InfoTooltip>{tooltip}</InfoTooltip>
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      <InputGroup>
        <InputGroupInput
          id={id}
          type="number"
          min={min}
          max={max}
          value={raw}
          aria-label={ariaLabel ?? label}
          onChange={(event) => {
            const next = event.target.value;
            setRaw(next);
            if (next === "") return;
            const parsed = Number(next);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
        <InputGroupAddon align="inline-end">{unit}</InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function TimingSection({
  monitor,
  selectedUserAgent,
  onPatch,
  onPatchMany
}: {
  monitor: Partial<Monitor>;
  selectedUserAgent: string;
  onPatch: MonitorPatch;
  onPatchMany: (values: Partial<Monitor>) => void;
}) {
  const interval = monitor.interval_seconds;
  const selectedPreset = schedulePresets.find(
    (preset) => preset.interval === interval && preset.jitter === monitor.jitter_percent
  );

  return (
    <Card className="rounded-md border border-border shadow-sm ring-0">
      <CardHeader>
        <SectionTitle
          icon={Timer}
          title="Schedule"
          description="How often to check, with timeout and request profile."
        />
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <SubSectionLabel>Cadence presets</SubSectionLabel>
          <div className="flex flex-wrap gap-2">
            {schedulePresets.map((preset) => {
              const active = selectedPreset?.label === preset.label;
              return (
                <Button
                  key={preset.label}
                  type="button"
                  variant={active ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    onPatchMany({
                      interval_seconds: preset.interval,
                      jitter_percent: preset.jitter
                    })
                  }
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <SubSectionLabel>Timing</SubSectionLabel>
          <div className="grid gap-5 md:grid-cols-3">
            <IntervalInput
              label="Check interval"
              value={monitor.interval_seconds}
              minSeconds={30}
              onChange={(value) => onPatch("interval_seconds", value)}
            />
            <NumberWithUnit
              label="Random jitter"
              tooltip="Adds a random delay (±jitter% of the interval) before each check. Varying request timing helps avoid predictable patterns that trigger anti-bot systems."
              value={monitor.jitter_percent}
              unit="%"
              min={0}
              max={100}
              onChange={(value) => onPatch("jitter_percent", value)}
            />
            <NumberWithUnit
              label="Request timeout"
              value={monitor.timeout_seconds}
              unit="seconds"
              min={3}
              max={120}
              onChange={(value) => onPatch("timeout_seconds", value)}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SubSectionLabel tooltip="The User-Agent header sent with each HTTP request. Many sites serve different content or block non-browser agents. 'Random' rotates through common browser strings on each request.">
            Request identity
          </SubSectionLabel>
          <ChoiceGrid
            label=""
            value={selectedUserAgent}
            choices={userAgentPresets}
            onChange={(value) => onPatch("user_agent_mode", value === "custom" ? "" : value)}
          />
          {selectedUserAgent === "custom" ? (
            <FormField label="Custom user agent">
              <Input
                value={monitor.user_agent_mode ?? ""}
                onChange={(event) => onPatch("user_agent_mode", event.target.value)}
                placeholder={CHROME_DESKTOP_UA}
              />
            </FormField>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
