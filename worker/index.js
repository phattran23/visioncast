// VisionCast Worker: serves the built site (static assets) and a small account
// API backed by Cloudflare D1.
//
//   POST /api/signup  { name, email, password }  -> { user }  + session cookie
//   POST /api/login   { email, password }        -> { user }  + session cookie
//   POST /api/logout                             -> {}        (clears session)
//   GET  /api/me                                 -> { user }  | 401
//   GET  /api/data                               -> { data, updatedAt }
//   PUT  /api/data    { data }                   -> { updatedAt }
//   POST /api/data-beacon { data }               (same, for sendBeacon on page close)
//
// Passwords are stored as PBKDF2-SHA256 hashes with a per-user random salt.
// Sessions are random 256-bit tokens kept in an HttpOnly, Secure cookie.

const SESSION_COOKIE = "vc_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000; // Workers' maximum
const MAX_DATA_BYTES = 512 * 1024;
const MAX_LOGIN_FAILS = 8; // per email per 15 minutes

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     pass_hash TEXT NOT NULL,
     salt TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS user_data (
     user_id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS login_fails (
     email TEXT NOT NULL,
     at INTEGER NOT NULL
   )`,
];

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  schemaReady = true;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const fail = (status, error) => json({ error }, status);

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

// Constant-time comparison of two hex strings
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const normEmail = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function readCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

async function createSession(db, userId) {
  const token = randomHex(32);
  const expires = Date.now() + SESSION_DAYS * 864e5;
  await db
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expires)
    .run();
  return token;
}

async function currentUser(req, db) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.email, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    )
    .bind(token)
    .first();
  if (!row || row.expires_at < Date.now()) return null;
  return { ...row, token };
}

// ── routes ───────────────────────────────────────────────────────────────────
async function signup(req, db) {
  const body = await readJson(req);
  const name = String(body?.name || "").trim().slice(0, 60);
  const email = normEmail(body?.email);
  const password = String(body?.password || "");
  if (!name) return fail(400, "name_required");
  if (!validEmail(email)) return fail(400, "email_invalid");
  if (password.length < 8 || password.length > 200) return fail(400, "password_short");

  const exists = await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return fail(409, "email_taken");

  const id = crypto.randomUUID();
  const salt = randomHex(16);
  const passHash = await hashPassword(password, salt);
  await db
    .prepare(
      "INSERT INTO users (id, email, name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, email, name, passHash, salt, Date.now())
    .run();
  const token = await createSession(db, id);
  return json({ user: { id, name, email } }, 201, {
    "set-cookie": sessionCookie(token, SESSION_DAYS * 86400),
  });
}

async function login(req, db) {
  const body = await readJson(req);
  const email = normEmail(body?.email);
  const password = String(body?.password || "");
  if (!validEmail(email) || !password) return fail(400, "credentials_required");

  const since = Date.now() - 15 * 60 * 1000;
  const fails = await db
    .prepare("SELECT COUNT(*) AS n FROM login_fails WHERE email = ? AND at > ?")
    .bind(email, since)
    .first();
  if ((fails?.n || 0) >= MAX_LOGIN_FAILS) return fail(429, "too_many_attempts");

  const user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  // Hash even when the user doesn't exist so timing doesn't reveal accounts
  const hash = await hashPassword(password, user?.salt || "00".repeat(16));
  if (!user || !safeEqual(hash, user.pass_hash)) {
    await db.prepare("INSERT INTO login_fails (email, at) VALUES (?, ?)").bind(email, Date.now()).run();
    return fail(401, "credentials_wrong");
  }
  await db.prepare("DELETE FROM login_fails WHERE email = ?").bind(email).run();
  const token = await createSession(db, user.id);
  return json({ user: publicUser(user) }, 200, {
    "set-cookie": sessionCookie(token, SESSION_DAYS * 86400),
  });
}

async function logout(req, db) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return json({}, 200, { "set-cookie": sessionCookie("", 0) });
}

async function getData(user, db) {
  const row = await db
    .prepare("SELECT data, updated_at FROM user_data WHERE user_id = ?")
    .bind(user.id)
    .first();
  return json({ data: row ? JSON.parse(row.data) : null, updatedAt: row?.updated_at || 0 });
}

async function putData(req, user, db) {
  const text = await req.text();
  if (text.length > MAX_DATA_BYTES) return fail(413, "too_large");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "bad_json");
  }
  if (!body || typeof body.data !== "object" || Array.isArray(body.data))
    return fail(400, "bad_data");
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(user.id, JSON.stringify(body.data), now)
    .run();
  return json({ updatedAt: now });
}

async function handleApi(req, env, url) {
  const db = env.DB;
  if (!db) return fail(500, "no_database");
  await ensureSchema(db);

  // Same-origin only for state-changing requests
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) return fail(403, "bad_origin");
  }

  const route = `${req.method} ${url.pathname}`;
  if (route === "POST /api/signup") return signup(req, db);
  if (route === "POST /api/login") return login(req, db);
  if (route === "POST /api/logout") return logout(req, db);

  const user = await currentUser(req, db);
  if (!user) return fail(401, "signed_out");
  if (route === "GET /api/me") return json({ user: publicUser(user) });
  if (route === "GET /api/data") return getData(user, db);
  // PUT, or POST from navigator.sendBeacon when the page is closing
  if (route === "PUT /api/data" || route === "POST /api/data-beacon")
    return putData(req, user, db);
  return fail(404, "not_found");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url);
      } catch (e) {
        console.error(e);
        return fail(500, "server_error");
      }
    }
    return env.ASSETS.fetch(req);
  },
};
