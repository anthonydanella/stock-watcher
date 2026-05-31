import { LoaderCircle, Pause, Play, Power, Trash2, X } from "lucide-react";
import React from "react";

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

export function BulkActionBar({
  count,
  busy,
  onEnable,
  onPause,
  onRun,
  onDelete,
  onClear
}: {
  count: number;
  busy: "enable" | "pause" | "run" | "delete" | null;
  onEnable: () => void;
  onPause: () => void;
  onRun: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const anyBusy = busy !== null;
  const label = `${count} ${count === 1 ? "monitor" : "monitors"}`;
  return (
    <>
      <ActionBar ariaLabel="Bulk actions">
        <span className="text-sm font-medium tabular-nums">
          {count}
          <span className="hidden sm:inline"> {count === 1 ? "monitor" : "monitors"}</span> selected
        </span>
        <ActionBarSeparator />
        <Button variant="ghost" size="sm" disabled={anyBusy} onClick={onEnable}>
          {busy === "enable" ? <LoaderCircle className="animate-spin" /> : <Power />}
          <span className="hidden sm:inline">Enable</span>
        </Button>
        <Button variant="ghost" size="sm" disabled={anyBusy} onClick={onPause}>
          {busy === "pause" ? <LoaderCircle className="animate-spin" /> : <Pause />}
          <span className="hidden sm:inline">Pause</span>
        </Button>
        <Button variant="ghost" size="sm" disabled={anyBusy} onClick={onRun}>
          {busy === "run" ? <LoaderCircle className="animate-spin" /> : <Play />}
          <span className="hidden sm:inline">Run now</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={anyBusy}
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
        >
          {busy === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
          <span className="hidden sm:inline">Delete</span>
        </Button>
        <ActionBarSeparator className="hidden sm:block" />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={anyBusy}
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X />
        </Button>
      </ActionBar>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected monitors and their check history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Delete {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
