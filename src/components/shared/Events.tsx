import { Activity } from "lucide-react";
import type { Snapshot } from "../../types";
export function Events({
  data,
  readIds,
}: {
  data: Snapshot;
  readIds: string[];
}) {
  return data.events.length ? (
    <div>
      {data.events.map((e) => (
        <div className="event" key={e.id}>
          <span className={`event-icon ${e.severity}`}>
            <Activity size={16} />
          </span>
          <div>
            <strong>
              {e.title}
              {!readIds.includes(e.id) && <i className="unread" />}
            </strong>
            <small>{e.detail}</small>
            <time>{new Date(e.at).toLocaleString()}</time>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="empty">No collection events in this view.</div>
  );
}
