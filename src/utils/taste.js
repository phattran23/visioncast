// ── Taste profile & personalised picks ───────────────────────────────────────
// Builds "For you" content from three signals the app already has:
//   - search: titles opened from search (strongest) and recent search terms
//   - watchlist: saved titles
//   - history: what was watched, recent first
// Everything runs on TMDB's public endpoints; nothing leaves the browser
// except the TMDB requests themselves.

import { storage } from "./storage";
import { tmdbFetch } from "./api";

const PICKS_KEY = "searchPicks";
const MAX_PICKS = 20;

const keyOf = (i) => `${i.media_type === "tv" ? "tv" : "movie"}_${i.id}`;

/** Remember a title the user opened from search results. */
export function recordSearchPick(item, term) {
  if (!item?.id) return;
  const media_type = item.media_type === "tv" ? "tv" : "movie";
  const pick = {
    id: item.id,
    media_type,
    title: item.title || item.name,
    genre_ids: item.genre_ids || [],
    term: term || null,
    at: Date.now(),
  };
  const prev = storage.get(PICKS_KEY) || [];
  storage.set(
    PICKS_KEY,
    [pick, ...prev.filter((p) => keyOf(p) !== keyOf(pick))].slice(0, MAX_PICKS),
  );
}

export function getSearchPicks() {
  return storage.get(PICKS_KEY) || [];
}

export function getSearchTerms() {
  return storage.get("searchHistory") || [];
}

/**
 * Weighted seed titles to base recommendations on, strongest first.
 * Search picks > watchlist > watch history; recency adds weight.
 */
export function getSeeds({ history = [], saved = [] }) {
  const seeds = new Map();
  const add = (item, weight) => {
    if (!item?.id) return;
    const k = keyOf(item);
    const prev = seeds.get(k);
    seeds.set(k, {
      id: item.id,
      media_type: item.media_type === "tv" ? "tv" : "movie",
      title: item.title || item.name,
      genre_ids: item.genre_ids || prev?.genre_ids || [],
      weight: (prev?.weight || 0) + weight,
    });
  };
  getSearchPicks()
    .slice(0, 6)
    .forEach((p, i) => add(p, 3 - i * 0.3));
  saved.slice(0, 8).forEach((s, i) => add(s, 2 - i * 0.15));
  [...history]
    .sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0))
    .slice(0, 10)
    .forEach((h, i) => add(h, 1.6 - i * 0.12));
  return [...seeds.values()].sort((a, b) => b.weight - a.weight);
}

/** Resolve recent search terms the user never clicked into titles. */
async function seedsFromTerms(apiKey, known) {
  const terms = getSearchTerms().slice(0, 3);
  const out = [];
  for (const term of terms) {
    try {
      const d = await tmdbFetch(
        `/search/multi?query=${encodeURIComponent(term)}&include_adult=false`,
        apiKey,
      );
      const top = (d.results || []).find(
        (r) => (r.media_type === "movie" || r.media_type === "tv") && r.vote_count > 50,
      );
      if (top && !known.has(keyOf(top)))
        out.push({
          id: top.id,
          media_type: top.media_type,
          title: top.title || top.name,
          genre_ids: top.genre_ids || [],
          term,
          weight: 1.2,
        });
    } catch {}
  }
  return out;
}

// A title worth recommending: decent rating from enough voters, has artwork
const isGood = (i) =>
  i.poster_path && (i.vote_average || 0) >= 6.5 && (i.vote_count || 0) >= 150;

/**
 * Personalised recommendations: TMDB recommendations for each seed, scored
 * by how many (and how strong) seeds suggest the title, plus its rating.
 * Returns { items, seeds, because } where `because` is the row for the most
 * recent search ("Because you searched …"), or null.
 */
export async function buildRecommendations({ apiKey, history = [], saved = [] }) {
  let seeds = getSeeds({ history, saved });
  const known = new Set(seeds.map(keyOf));
  seeds = [...seeds, ...(await seedsFromTerms(apiKey, known))].slice(0, 8);
  if (seeds.length === 0) return { items: [], seeds, because: null };

  const exclude = new Set([...known, ...history.map(keyOf)]);
  const scores = new Map();

  const lists = await Promise.all(
    seeds.map((seed) =>
      tmdbFetch(`/${seed.media_type}/${seed.id}/recommendations`, apiKey)
        .then((d) =>
          (d.results || []).map((r) => ({ ...r, media_type: seed.media_type })),
        )
        .catch(() => []),
    ),
  );

  lists.forEach((list, si) => {
    const seed = seeds[si];
    list.forEach((item, rank) => {
      if (!isGood(item) || exclude.has(keyOf(item))) return;
      const k = keyOf(item);
      const prev = scores.get(k);
      // Higher for strong seeds and items near the top of a seed's list
      const gain = seed.weight * (1 - rank / 40);
      scores.set(k, {
        item,
        score: (prev?.score || 0) + gain,
        hits: (prev?.hits || 0) + 1,
      });
    });
  });

  const items = [...scores.values()]
    .map((s) => ({ ...s, score: s.score + s.item.vote_average / 4 + (s.hits - 1) * 1.5 }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item)
    .slice(0, 24);

  // "Because you searched …": the newest search-driven seed and its list
  const searchSeedIdx = seeds.findIndex(
    (s) => getSearchPicks().some((p) => keyOf(p) === keyOf(s)) || s.term,
  );
  let because = null;
  if (searchSeedIdx >= 0) {
    const seed = seeds[searchSeedIdx];
    const list = lists[searchSeedIdx]
      .filter((i) => isGood(i) && !exclude.has(keyOf(i)))
      .slice(0, 20);
    if (list.length >= 4) because = { title: seed.title, items: list };
  }

  return { items, seeds, because };
}

/**
 * The user's favourite genre (by seed weight) and well-rated titles in it.
 * Seeds without stored genres are looked up (a few TMDB detail requests).
 */
export async function buildTopGenre({ apiKey, seeds }) {
  if (!seeds?.length) return null;
  const weights = new Map(); // "movie:28" -> weight
  await Promise.all(
    seeds.slice(0, 8).map(async (s) => {
      let ids = s.genre_ids;
      if (!ids?.length) {
        try {
          const d = await tmdbFetch(`/${s.media_type}/${s.id}`, apiKey);
          ids = (d.genres || []).map((g) => g.id);
        } catch {
          ids = [];
        }
      }
      ids.forEach((g, i) => {
        const k = `${s.media_type}:${g}`;
        // First listed genre is the main one
        weights.set(k, (weights.get(k) || 0) + s.weight * (i === 0 ? 1 : 0.5));
      });
    }),
  );
  const best = [...weights.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [type, genreId] = best[0].split(":");

  const [genres, discover] = await Promise.all([
    tmdbFetch(`/genre/${type}/list`, apiKey).catch(() => ({ genres: [] })),
    tmdbFetch(
      `/discover/${type}?with_genres=${genreId}&sort_by=popularity.desc&vote_average.gte=7&vote_count.gte=300`,
      apiKey,
    ).catch(() => ({ results: [] })),
  ]);
  const name = (genres.genres || []).find((g) => String(g.id) === genreId)?.name;
  const seen = new Set(seeds.map(keyOf));
  const items = (discover.results || [])
    .map((i) => ({ ...i, media_type: type }))
    .filter((i) => i.poster_path && !seen.has(keyOf(i)))
    .slice(0, 20);
  if (!name || items.length < 4) return null;
  return { name, items };
}
