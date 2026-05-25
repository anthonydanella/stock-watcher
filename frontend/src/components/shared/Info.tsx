export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words [overflow-wrap:anywhere]">{value || "-"}</p>
    </div>
  );
}
