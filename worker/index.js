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

// Sites allowed to call the API: this Worker itself, the Vercel mirror (which
// proxies /api/* here, see vercel.json) and anything listed in ALLOWED_ORIGINS
const VERCEL_ORIGIN = /^https:\/\/visioncast(-[a-z0-9-]+)?\.vercel\.app$/;
function originAllowed(origin, url, env) {
  if (!origin || origin === url.origin) return true;
  if (VERCEL_ORIGIN.test(origin)) return true;
  const extra = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

async function handleApi(req, env, url) {
  // Public app config: the TMDB *read-only* token for builds made without
  // one (Git-connected Cloudflare/Vercel builds). The same token ships inside
  // the app bundle anyway; it only allows reading TMDB's public catalogue.
  if (req.method === "GET" && url.pathname === "/api/config")
    return json(
      { tmdbToken: env.TMDB_TOKEN || null },
      200,
      { "cache-control": "public, max-age=3600" },
    );

  const db = env.DB;
  if (!db) return fail(500, "no_database");
  await ensureSchema(db);

  // Same-site only for state-changing requests
  if (req.method !== "GET" && !originAllowed(req.headers.get("origin"), url, env))
    return fail(403, "bad_origin");

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

// ── Share cards ─────────────────────────────────────────────────────────────
// Chat apps (Messenger, Facebook, Zalo, WhatsApp, Telegram…) read a link's
// HTML without running JavaScript. For /movie/:id and /tv/:id we serve the
// app's index.html with the film's name, synopsis and artwork as Open Graph
// tags, so the link shows up as a picture card.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function tmdbTitle(env, type, id, lang) {
  if (!env.TMDB_TOKEN) return null;
  const api = `https://api.themoviedb.org/3/${type}/${id}?language=${lang}`;
  const cache = caches.default;
  const key = new Request(`https://share-card.cache/${type}/${id}/${lang}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const r = await fetch(api, { headers: { Authorization: `Bearer ${env.TMDB_TOKEN}` } });
  if (!r.ok) return null;
  const data = await r.json();
  await cache.put(key, new Response(JSON.stringify(data), { headers: { "cache-control": "public, max-age=86400" } }));
  return data;
}

async function shareCard(req, env, url, type, id) {
  const page = await env.ASSETS.fetch(new Request(new URL("/", url), req));
  let d = null;
  try {
    d = await tmdbTitle(env, type, id, "vi-VN");
    // No Vietnamese synopsis: take the English one
    if (d && !d.overview) {
      const en = await tmdbTitle(env, type, id, "en-US");
      if (en?.overview) d = { ...d, overview: en.overview };
    }
  } catch (e) {
    console.error("share card", e);
  }
  if (!d || !d.id) return page;

  const name = d.title || d.name || "VisionCast";
  const year = (d.release_date || d.first_air_date || "").slice(0, 4);
  const heading = `${name}${year ? ` (${year})` : ""}`;
  const rating = d.vote_average ? `★ ${d.vote_average.toFixed(1)} · ` : "";
  const kind = type === "tv" ? "Phim bộ" : "Phim lẻ";
  const overview = (d.overview || "").replace(/\s+/g, " ").trim();
  const desc = `${rating}${kind}${overview ? ` · ${overview.length > 190 ? overview.slice(0, 187) + "…" : overview}` : ""}`;
  const art = d.backdrop_path
    ? { src: `https://image.tmdb.org/t/p/w1280${d.backdrop_path}`, w: 1280, h: 720 }
    : d.poster_path
      ? { src: `https://image.tmdb.org/t/p/w780${d.poster_path}`, w: 780, h: 1170 }
      : null;
  // Shared links point to the public site (Vercel), not this Worker
  const canonical = `${env.PUBLIC_ORIGIN || url.origin}/${type}/${d.id}`;

  const tags = [
    `<meta property="og:type" content="${type === "tv" ? "video.tv_show" : "video.movie"}" />`,
    `<meta property="og:site_name" content="VisionCast" />`,
    `<meta property="og:title" content="${esc(heading)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta name="twitter:title" content="${esc(heading)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
  ];
  if (art)
    tags.push(
      `<meta property="og:image" content="${art.src}" />`,
      `<meta property="og:image:secure_url" content="${art.src}" />`,
      `<meta property="og:image:width" content="${art.w}" />`,
      `<meta property="og:image:height" content="${art.h}" />`,
      `<meta property="og:image:alt" content="${esc(name)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${art.src}" />`,
    );

  const res = new HTMLRewriter()
    // drop the site-wide defaults the card replaces
    .on('meta[property^="og:"], meta[name="description"], meta[name^="twitter:"]', {
      element: (el) => el.remove(),
    })
    .on("title", { element: (el) => el.setInnerContent(`${heading} · VisionCast`) })
    .on("head", { element: (el) => el.append(tags.join("\n"), { html: true }) })
    .transform(page);
  const out = new Response(res.body, res);
  out.headers.set("content-type", "text/html; charset=utf-8");
  out.headers.set("cache-control", "public, max-age=600");
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/(movie|tv)\/(\d+)\/?$/);
    if (m && req.method === "GET") {
      try {
        return await shareCard(req, env, url, m[1], m[2]);
      } catch (e) {
        console.error(e);
        return env.ASSETS.fetch(new Request(new URL("/", url), req));
      }
    }
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
