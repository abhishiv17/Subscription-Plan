import { fmtDate } from "@/lib/format";

export type SubscriptionEvent = {
  id: number;
  event: "created" | "status" | "expiry";
  from_status: string | null;
  to_status: string | null;
  expiry_date: string | null;
  actor: string | null;
  created_at: string;
};

function describe(e: SubscriptionEvent) {
  if (e.event === "created") return `Created as ${e.to_status}`;
  if (e.event === "expiry") return e.expiry_date ? `End date set to ${fmtDate(e.expiry_date)}` : "End date removed";
  switch (e.to_status) {
    case "quotation": return "Quotation sent";
    case "draft": return "Returned to draft";
    case "confirmed": return "Confirmed";
    case "active": return e.from_status === "paused" ? "Resumed" : "Activated";
    case "paused": return "Paused";
    case "closed": return ["draft", "quotation", "confirmed"].includes(e.from_status ?? "") ? "Cancelled before starting" : "Closed";
    default: return `Status changed to ${e.to_status}`;
  }
}

const fmtTime = (v: string) =>
  new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Timeline of lifecycle changes, newest first. `actorName` turns an actor id into a label.
 * History is recorded from 31 Oct 2026; older subscriptions start with a synthetic "created" entry.
 */
export function SubscriptionHistory({ events, createdAt, actorName }: { events: SubscriptionEvent[]; createdAt: string; actorName: (actor: string | null) => string }) {
  const hasCreated = events.some((e) => e.event === "created");
  const rows = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5 text-sm">
      {rows.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-white" aria-hidden />
          <div className="font-medium text-slate-800">{describe(e)}</div>
          <div className="text-xs text-slate-500">{fmtTime(e.created_at)} · {actorName(e.actor)}</div>
        </li>
      ))}
      {!hasCreated && (
        <li className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-white" aria-hidden />
          <div className="font-medium text-slate-800">Created</div>
          <div className="text-xs text-slate-500">{fmtTime(createdAt)} · earlier changes were not recorded</div>
        </li>
      )}
    </ol>
  );
}
