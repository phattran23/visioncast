// ── Accounts & sync ──────────────────────────────────────────────────────────
// Talks to the Worker API (worker/index.js). A signed-in user's personal data
// (watchlist, history, progress, search picks, settings) is mirrored to their
// account so it follows them across devices; guests keep everything in this
// browser only.

import { storage, onStorageWrite } from "./storage";

const MODE_KEY = "authMode"; // "user" | "guest" | null (not chosen yet)
const ACCOUNT_KEY = "account"; // { id, name, email }
const SYNCED_AT_KEY = "syncedAt"; // server updatedAt of the data we hold

// Personal data that belongs to the account
const PERSONAL_KEYS = [
  "saved",
  "savedOrder",
  "history",
  "progress",
  "watched",
  "searchPicks",
  "searchHistory",
];
// Preferences that also follow the account
const PREF_KEYS = [
  "tmdbLang",
  "theme",
  "accentColor",
  "ageLimit",
  "homeRowOrder",
  "homeRowVisible",
  "homeViewMode",
  "startPage",
  "librarySort",
  "historyEnabled",
];
const SYNC_KEYS = [...PERSONAL_KEYS, ...PREF_KEYS];

export const getAuthMode = () => storage.get(MODE_KEY);
export const getAccount = () => storage.get(ACCOUNT_KEY);

async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`./api/${path}`, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, error: data.error, ...data };
}

const collectData = () =>
  Object.fromEntries(
    SYNC_KEYS.map((k) => [k, storage.get(k)]).filter(([, v]) => v !== null),
  );

function applyData(data) {
  for (const k of SYNC_KEYS) {
    if (data && k in data) storage.set(k, data[k]);
    else if (PERSONAL_KEYS.includes(k)) storage.remove(k);
  }
}

let pushTimer = null;
let applying = false;

export async function pushData() {
  if (getAuthMode() !== "user") return;
  const r = await api("data", { method: "PUT", body: { data: collectData() } });
  if (r.ok) storage.set(SYNCED_AT_KEY, r.updatedAt);
  else if (r.status === 401) markSignedOut();
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushData, 1500);
}

function markSignedOut() {
  storage.remove(ACCOUNT_KEY);
  storage.set(MODE_KEY, null);
  window.dispatchEvent(new CustomEvent("visioncast:auth-changed"));
}

function signedIn(user) {
  storage.set(ACCOUNT_KEY, user);
  storage.set(MODE_KEY, "user");
}

/** Create an account; whatever is in this browser becomes the account's data. */
export async function signUp({ name, email, password }) {
  const r = await api("signup", { method: "POST", body: { name, email, password } });
  if (!r.ok) return { error: r.error || "server_error" };
  signedIn(r.user);
  await pushData();
  return { user: r.user };
}

/** Sign in; the account's saved data replaces what's in this browser. */
export async function signIn({ email, password }) {
  const r = await api("login", { method: "POST", body: { email, password } });
  if (!r.ok) return { error: r.error || "server_error" };
  signedIn(r.user);
  const d = await api("data");
  if (d.ok && d.data) {
    applying = true;
    applyData(d.data);
    applying = false;
    storage.set(SYNCED_AT_KEY, d.updatedAt);
  } else {
    await pushData(); // first sign-in on a brand new account
  }
  return { user: r.user };
}

export function continueAsGuest() {
  storage.set(MODE_KEY, "guest");
}

/** Sign out and remove this account's personal data from the browser. */
export async function signOut() {
  clearTimeout(pushTimer);
  await pushData();
  await api("logout", { method: "POST" });
  PERSONAL_KEYS.forEach((k) => storage.remove(k));
  storage.remove(SYNCED_AT_KEY);
  storage.remove(ACCOUNT_KEY);
  storage.set(MODE_KEY, null);
}

/** Back to the sign-in screen without touching local data (guest → account). */
export function showAuthScreen() {
  storage.set(MODE_KEY, null);
}

/**
 * Start background sync for a signed-in user: push changes as they happen,
 * and pull newer data saved from another device (then reload to apply it).
 */
export function startSync() {
  if (getAuthMode() !== "user") return () => {};
  const off = onStorageWrite((key) => {
    if (!applying && SYNC_KEYS.includes(key)) schedulePush();
  });
  (async () => {
    const me = await api("me");
    if (me.status === 401) return markSignedOut();
    if (!me.ok) return; // offline: keep working locally
    storage.set(ACCOUNT_KEY, me.user);
    const d = await api("data");
    if (d.ok && d.data && d.updatedAt > (storage.get(SYNCED_AT_KEY) || 0)) {
      applying = true;
      applyData(d.data);
      applying = false;
      storage.set(SYNCED_AT_KEY, d.updatedAt);
      window.location.reload();
    }
  })();
  const flush = () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
      navigator.sendBeacon?.(
        "./api/data-beacon",
        new Blob([JSON.stringify({ data: collectData() })], {
          type: "application/json",
        }),
      );
    }
  };
  window.addEventListener("pagehide", flush);
  return () => {
    off();
    window.removeEventListener("pagehide", flush);
  };
}

export function passwordStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 8) s++;
  return s; // 0..4
}
