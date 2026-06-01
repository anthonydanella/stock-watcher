import { LoaderCircle, Play, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { cn } from "../../../lib/utils";
import { ActionBar, ActionBarSeparator } from "../../shared/ActionBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";

type BusyAction = "save" | "run" | "delete" | "duplicate" | null;

export function EditorActions({
  isNew,
  busyAction,
  dirty,
  blockingCount,
  onSave,
  onSaveAndRun
}: {
  isNew: boolean;
  busyAction: BusyAction;
  dirty: boolean;
  blockingCount: number;
  onSave: () => void;
  onSaveAndRun: () => void;
}) {
  const busy = Boolean(busyAction);
  const saveDisabled = busy || blockingCount > 0 || (!isNew && !dirty);
  const saveAndRunDisabled = busy || blockingCount > 0;

  let status = isNew ? "Ready to create" : "Unsaved changes";
  let statusClass = "text-foreground";
  if (blockingCount > 0) {
    status = `${blockingCount} issue${blockingCount === 1 ? "" : "s"} to fix`;
    statusClass = "text-destructive";
  } else if (!isNew && !dirty) {
    status = "All changes saved";
    statusClass = "text-muted-foreground";
  }

  return (
    <ActionBar ariaLabel="Editor actions">
      <span className={cn("text-sm font-medium", statusClass)}>{status}</span>
      <ActionBarSeparator />
      {!isNew ? (
        <Button variant="ghost" size="sm" disabled={saveAndRunDisabled} onClick={onSaveAndRun}>
          {busyAction === "run" ? <LoaderCircle className="animate-spin" /> : <Play />}
          Save & run
        </Button>
      ) : null}
      <Button size="sm" disabled={saveDisabled} onClick={onSave}>
        {busyAction === "save" ? <LoaderCircle className="animate-spin" /> : <Save />}
        {isNew ? "Create monitor" : "Save changes"}
      </Button>
    </ActionBar>
  );
}

export function DangerZone({
  busyAction,
  onRemove
}: {
  busyAction: BusyAction;
  onRemove: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = Boolean(busyAction);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-destructive">Delete monitor</p>
        <p className="text-xs text-muted-foreground">
          Removes the monitor and its history. This cannot be undone.
        </p>
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={() => setConfirmOpen(true)}
      >
        {busyAction === "delete" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Delete monitor
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this monitor?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the monitor and its check history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onRemove();
              }}
            >
              Delete monitor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
