export function SectionHeader({ id, title }: { id: string; title: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 id={id} className="text-sm font-semibold uppercase text-muted-foreground">
        {title}
      </h2>
    </div>
  );
}
