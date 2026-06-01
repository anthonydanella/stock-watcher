import { useQuery } from "@tanstack/react-query";

import { EventsTable } from "../components/events/EventsTable";
import { PageHeader } from "../components/shared/PageHeader";
import { MonitorListSkeleton } from "../components/shared/Skeletons";
import { useQueryErrorToast } from "../hooks/useQueryErrorToast";
import { eventsQuery } from "../lib/queries";

export function Events() {
  const eventsQ = useQuery(eventsQuery());
  useQueryErrorToast(eventsQ.isError, eventsQ.error, "Could not load events");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Status changes, repeated errors, challenge detections, and manual actions."
      />
      {eventsQ.isPending ? <MonitorListSkeleton /> : <EventsTable events={eventsQ.data ?? []} />}
    </div>
  );
}
