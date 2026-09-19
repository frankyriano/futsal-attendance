export type Status = "出席" | "欠席" | "未回答";
export type Member = { id: string; name: string };
export type Answer = {
  status: Status;
  includeSelf: boolean;
  guests: string[];
  note: string;
  updatedAt: string;
};
export type Event = {
  id: string;
  date: string;
  answers: Record<string, Answer>;
};
export type Data = { members: Member[]; events: Event[] };
export type Command =
  | { type: "add-event"; id: string; date: string }
  | { type: "save-member"; id: string; name: string; editing: boolean }
  | { type: "reorder-members"; ids: string[] }
  | { type: "save-answer"; eventId: string; memberId: string; answer: Answer }
  | { type: "delete-event"; id: string; date: string }
  | { type: "delete-member"; id: string };

export function eventSelectionId(events: Event[], today: string, current = "") {
  if (events.some(event => event.id === current)) return current;
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  return (sorted.find(event => event.date >= today) ?? sorted.at(-1))?.id ?? "";
}

export function topNavigationEvents(events: Event[], today: string) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const past = sorted.filter(event => event.date < today);
  const todayAndFuture = sorted.filter(event => event.date >= today);
  let visiblePast = past.slice(-2);
  const visibleUpcoming = todayAndFuture.slice(0, 6 - visiblePast.length);
  const remaining = 6 - visiblePast.length - visibleUpcoming.length;
  if (remaining > 0) {
    const earlierPast = past.slice(0, Math.max(0, past.length - visiblePast.length));
    visiblePast = [...earlierPast.slice(-remaining), ...visiblePast];
  }
  return [...visiblePast, ...visibleUpcoming];
}

export function validCommand(value: unknown): value is Command {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  switch (c.type) {
    case "add-event":
    case "delete-event":
      return uuid(c.id) && date(c.date);
    case "delete-member":
      return uuid(c.id);
    case "reorder-members":
      return Array.isArray(c.ids) && c.ids.length > 0 && c.ids.every(uuid) && new Set(c.ids.map(id => id.toLowerCase())).size === c.ids.length;
    case "save-member":
      return uuid(c.id) && typeof c.editing === "boolean" && typeof c.name === "string" && c.name.trim().length > 0 && c.name.length <= 60;
    case "save-answer": {
      if (!uuid(c.eventId) || !uuid(c.memberId) || !c.answer || typeof c.answer !== "object") return false;
      const a = c.answer as Record<string, unknown>;
      return typeof a.status === "string" && ["出席", "欠席", "未回答"].includes(a.status) && typeof a.includeSelf === "boolean" && Array.isArray(a.guests) && a.guests.length <= 100 && a.guests.every(g => typeof g === "string" && g.length <= 60) && typeof a.note === "string" && a.note.length <= 500;
    }
    default:
      return false;
  }
}
