import React from "react";

import { cn } from "../../lib/utils";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { InfoTooltip } from "./InfoTooltip";

function FieldHelp({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs font-normal leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
};

export function FormField({
  label,
  description,
  className,
  tooltip,
  children
}: {
  label: string;
  description?: string;
  className?: string;
  tooltip?: React.ReactNode;
  children: React.ReactElement<FieldControlProps>;
}) {
  const generatedId = React.useId();
  const fieldId = children.props.id ?? generatedId;
  const helpId = description ? `${fieldId}-help` : undefined;
  const describedBy =
    [children.props["aria-describedby"], helpId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-2 text-sm font-medium", className)}>
      {tooltip ? (
        <div className="flex items-center gap-1.5">
          <Label htmlFor={fieldId}>{label}</Label>
          <InfoTooltip>{tooltip}</InfoTooltip>
        </div>
      ) : (
        <Label htmlFor={fieldId}>{label}</Label>
      )}
      {React.cloneElement(children, { id: fieldId, "aria-describedby": describedBy })}
      {description ? <FieldHelp id={helpId}>{description}</FieldHelp> : null}
    </div>
  );
}

export function ToggleField({
  label,
  description,
  checked,
  onCheckedChange,
  className
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = React.useId();
  const helpId = `${id}-help`;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-md border bg-background p-3 text-sm font-medium",
        className
      )}
    >
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        <FieldHelp id={helpId}>{description}</FieldHelp>
      </div>
      <Switch
        id={id}
        aria-describedby={helpId}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function NumberField({
  label,
  description,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  description?: string;
  value?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const [raw, setRaw] = React.useState(value == null ? "" : String(value));

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-way parent→child sync; reacting to `raw` would loop
  React.useEffect(() => {
    const parsed = Number(raw);
    if (raw !== "" && Number.isFinite(parsed) && parsed === value) return;
    setRaw(value == null ? "" : String(value));
  }, [value]);

  return (
    <FormField label={label} description={description}>
      <Input
        type="number"
        min={min}
        max={max}
        value={raw}
        onChange={(event) => {
          const next = event.target.value;
          setRaw(next);
          if (next === "") return;
          const parsed = Number(next);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </FormField>
  );
}
