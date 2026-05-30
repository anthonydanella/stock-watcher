import { eventBadgeClass, eventLabel, formatDate } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { EventRow } from "../../types";
import { EmptyState } from "../shared/EmptyState";
import { PanelCard } from "../shared/PanelCard";
import { Badge } from "../ui/badge";
import { CardContent } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableRow } from "../ui/table";

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
                <Badge className={cn("shrink-0 border", eventBadgeClass(event.event_type))}>
                  {eventLabel(event.event_type)}
                </Badge>
              </div>
              <p className="break-words text-sm">{event.message}</p>
            </CardContent>
          </PanelCard>
        ))}
        {!events.length ? <EmptyState message="No events recorded." /> : null}
      </div>
      <PanelCard className="hidden min-w-0 overflow-hidden py-0 lg:block">
        <CardContent className="p-0">
          <Table>
            <thead className="border-b bg-muted/30">
              <tr>
                <TableHead className="pl-4">Time</TableHead>
                <TableHead>Monitor</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="pr-4">Message</TableHead>
              </tr>
            </thead>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">
                    {formatDate(event.created_at)}
                  </TableCell>
                  <TableCell className="max-w-xs break-words font-medium">
                    {event.monitor_name ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("border", eventBadgeClass(event.event_type))}>
                      {eventLabel(event.event_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-2xl pr-4 break-words [overflow-wrap:anywhere]">
                    {event.message}
                  </TableCell>
                </TableRow>
              ))}
              {!events.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No events recorded.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </PanelCard>
    </>
  );
}
