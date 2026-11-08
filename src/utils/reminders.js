// ── "Remind me" for upcoming releases ───────────────────────────────────────
// Saved per account (synced). When the app opens on or after a title's
// release date, the reminder fires once as an in-app notice.
import { storage } from "./storage";

const KEY = "reminders";
export const REMINDERS_EVENT = "visioncast:reminders";
const keyOf = (i) => `${i.media_type === "tv" ? "tv" : "movie"}_${i.id}`;

export const getReminders = () => storage.get(KEY) || {};
export const hasReminder = (item) => !!getReminders()[keyOf(item)];

export function toggleReminder(item, date) {
  const all = { ...getReminders() };
  const k = keyOf(item);
  if (all[k]) delete all[k];
  else
    all[k] = {
      id: item.id,
      media_type: item.media_type === "tv" ? "tv" : "movie",
      title: item.title || item.name,
      poster_path: item.poster_path || null,
      backdrop_path: item.backdrop_path || null,
      date: date || item.release_date || item.first_air_date || null,
      notified: false,
    };
  storage.set(KEY, all);
  window.dispatchEvent(new Event(REMINDERS_EVENT));
  return !!all[k];
}

/** Reminders whose date has arrived and that haven't fired yet (marks them). */
export function takeDueReminders() {
  const all = { ...getReminders() };
  const today = new Date().toISOString().slice(0, 10);
  const due = [];
  for (const [k, r] of Object.entries(all)) {
    if (!r.notified && r.date && r.date <= today) {
      due.push(r);
      all[k] = { ...r, notified: true };
    }
  }
  if (due.length) storage.set(KEY, all);
  return due;
}
