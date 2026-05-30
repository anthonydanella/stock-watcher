import { eventLabel, formatDate } from "../../lib/format";
import type { EventRow } from "../../types";
import { EmptyState } from "../shared/EmptyState";
import { PanelCard } from "../shared/PanelCard";
import { Badge } from "../ui/badge";
import { CardContent } from "../ui/card";
import { Table, TableCell, TableHead } from "../ui/table";

export function EventsTable({ events }: { events: EventRow[] }) {
  return (
    <>
      <div className="grid gap-3 lg:hidden">
        {events.map((event) => (
          <PanelCard key={event.id} className="min-w-0 overflow-hidden">
            <CardContent>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{event.monitor_name ?? "System"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p>
                </div>
                <Badge className="shrink-0 rounded-full">{eventLabel(event.event_type)}</Badge>
              </div>
              <p className="break-words text-sm">{event.message}</p>
            </CardContent>
          </PanelCard>
        ))}
        {!events.length ? <EmptyState message="No events recorded." /> : null}
      </div>
      <PanelCard className="hidden min-w-0 overflow-hidden lg:block">
        <CardContent>
          <Table>
            <thead>
              <tr>
                <TableHead>Time</TableHead>
                <TableHead>Monitor</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(event.created_at)}
                  </TableCell>
                  <TableCell className="max-w-xs break-words">
                    {event.monitor_name ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge className="rounded-full">{eventLabel(event.event_type)}</Badge>
                  </TableCell>
                  <TableCell className="max-w-2xl break-words [overflow-wrap:anywhere]">
                    {event.message}
                  </TableCell>
                </tr>
              ))}
              {!events.length ? (
                <tr>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No events recorded.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </CardContent>
      </PanelCard>
    </>
  );
}
