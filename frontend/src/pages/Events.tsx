import React from "react";
import { toast } from "sonner";

import { api } from "../api";
import { EventsTable } from "../components/events/EventsTable";
import { PageHeader } from "../components/shared/PageHeader";
import { MonitorListSkeleton } from "../components/shared/Skeletons";
import { errorMessage } from "../lib/format";
import type { EventRow } from "../types";

export function Events() {
  const [events, setEvents] = React.useState<EventRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api
      .events()
      .then(setEvents)
      .catch((exc) => toast.error(errorMessage(exc, "Could not load events")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Status changes, repeated errors, challenge detections, and manual actions."
      />
      {loading ? <MonitorListSkeleton /> : <EventsTable events={events} />}
    </div>
  );
}
