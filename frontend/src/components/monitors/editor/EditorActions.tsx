import { LoaderCircle, Save, Trash2 } from "lucide-react";

import { Button } from "../../ui/button";

export function EditorActions({
  isNew,
  busyAction
}: {
  isNew: boolean;
  busyAction: "save" | "run" | "delete" | null;
}) {
  const busy = Boolean(busyAction);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border bg-card p-3 shadow-sm">
      <p className="mr-auto text-xs text-muted-foreground">
        {isNew
          ? "Create the monitor to start checking."
          : "Save changes to apply on the next scheduled check."}
      </p>
      <Button type="submit" disabled={busy}>
        {busyAction === "save" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {busyAction === "save" ? "Saving" : isNew ? "Create monitor" : "Save changes"}
      </Button>
    </div>
  );
}

export function DangerZone({
  busyAction,
  confirmDelete,
  onRemove
}: {
  busyAction: "save" | "run" | "delete" | null;
  confirmDelete: boolean;
  onRemove: () => void;
}) {
  const busy = Boolean(busyAction);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-destructive">Delete monitor</p>
        <p className="text-xs text-muted-foreground">
          Removes the monitor and its history. This cannot be undone.
        </p>
      </div>
      <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onRemove}>
        {busyAction === "delete" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {busyAction === "delete" ? "Deleting" : confirmDelete ? "Confirm delete" : "Delete monitor"}
      </Button>
    </div>
  );
}
