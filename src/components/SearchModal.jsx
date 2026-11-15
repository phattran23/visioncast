import { useState, useEffect, useRef, useCallback } from "react";
import { tmdbFetch, imgUrl, posterSrcSet, backdropSrcSet } from "../utils/api";
import { storage } from "../utils/storage";
import { useT, useLang } from "../utils/i18n";
import { recordSearchPick, isDisliked } from "../utils/taste";

// Search, laid out like a streaming app's search screen:
//   - big field, filter chips (all / films / series / people)
//   - before typing: recent searches, quick genre chips, top searches
//   - results: best match as a large card, matching people, then a poster grid
// Matching ignores Vietnamese accents ("hoa" finds "Hòa"), two pages are
// fetched and re-ranked (exact / prefix title matches first), and late answers
// to an older query are dropped. Picking a title opens the quick preview.

const HISTORY_KEY = "searchHistory";
const MAX_HISTORY = 12;

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

const GENRES = [
  { id: "action", vi: "Hành động", en: "Action", path: "/discover/movie?with_genres=28&sort_by=popularity.desc&vote_count.gte=200", type: "movie" },
  { id: "comedy", vi: "Hài", en: "Comedy", path: "/discover/movie?with_genres=35&sort_by=popularity.desc&vote_count.gte=200", type: "movie" },
  { id: "korean", vi: "Phim Hàn", en: "Korean", path: "/discover/tv?with_origin_country=KR&sort_by=popularity.desc&vote_count.gte=50", type: "tv" },
  { id: "anime", vi: "Anime", en: "Anime", path: "/discover/tv?with_genres=16&with_origin_country=JP&sort_by=popularity.desc", type: "tv" },
  { id: "horror", vi: "Kinh dị", en: "Horror", path: "/discover/movie?with_genres=27&sort_by=popularity.desc&vote_count.gte=150", type: "movie" },
  { id: "romance", vi: "Tình cảm", en: "Romance", path: "/discover/movie?with_genres=10749&sort_by=popularity.desc&vote_count.gte=150", type: "movie" },
  { id: "scifi", vi: "Viễn tưởng", en: "Sci-fi", path: "/discover/movie?with_genres=878&sort_by=popularity.desc&vote_count.gte=200", type: "movie" },
  { id: "animation", vi: "Hoạt hình", en: "Animation", path: "/discover/movie?with_genres=16&sort_by=popularity.desc&vote_count.gte=200", type: "movie" },
  { id: "vietnam", vi: "Phim Việt", en: "Vietnamese", path: "/discover/movie?with_origin_country=VN&sort_by=popularity.desc", type: "movie" },
];

const FILTERS = ["all", "movie", "tv", "person"];

const Svg = ({ children, size = 22, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const SearchGlyph = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Svg>;
const XGlyph = ({ size = 18 }) => <Svg size={size}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
const PlayGlyph = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>;
const ClockGlyph = () => <Svg size={16} sw={1.9}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;

const year = (r) => (r.release_date || r.first_air_date || "").slice(0, 4);
const typeOf = (r, fallback) => (r.media_type === "tv" || r.media_type === "movie" ? r.media_type : fallback);

function rank(list, q) {
  const nq = norm(q);
  return list
    .map((r) => {
      const names = [r.title, r.name, r.original_title, r.original_name].map(norm).filter(Boolean);
      let s = Math.log10((r.popularity || 0) + 1) * 10 + Math.min(r.vote_count || 0, 5000) / 500;
      // whole words beat partial ones: "hoa" → "Hòa Bình" before "Hoang Dã"
      const word = (n) => (" " + n.replace(/[^a-z0-9]+/g, " ") + " ").includes(" " + nq + " ");
      if (names.some((n) => n === nq)) s += 60;
      else if (names.some((n) => n.startsWith(nq + " "))) s += 45;
      else if (names.some(word)) s += 36;
      else if (names.some((n) => n.startsWith(nq))) s += 24;
      else if (names.some((n) => n.includes(nq))) s += 12;
      if (!r.poster_path && !r.profile_path) s -= 25;
      return { r, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

export default function SearchModal({ apiKey, onSelect, onClose, offline }) {
  const t = useT();
  const lang = useLang();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [genre, setGenre] = useState(null); // preset chip
  const [person, setPerson] = useState(null); // { id, name } drill-down
  const [res, setRes] = useState({ titles: [], people: [] });
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState([]);
  const [history, setHistory] = useState(() => storage.get(HISTORY_KEY) || []);
  const [active, setActive] = useState(-1); // keyboard highlight in the results
  const inputRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  // Top searches for the empty state
  useEffect(() => {
    if (!apiKey || offline) return;
    tmdbFetch("/trending/all/day", apiKey)
      .then((d) =>
        setTrending(
          (d.results || [])
            .filter((r) => (r.media_type === "movie" || r.media_type === "tv") && r.backdrop_path && !isDisliked(r))
            .slice(0, 10),
        ),
      )
      .catch(() => {});
  }, [apiKey, offline, lang]);

  // Fetch results for the current query / filter / chip / person
  useEffect(() => {
    const q = query.trim();
    if (!q && !genre && !person) {
      seq.current++;
      setRes({ titles: [], people: [] });
      setLoading(false);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    setActive(-1);
    const timer = setTimeout(async () => {
      try {
        let titles = [];
        let people = [];
        if (person) {
          const d = await tmdbFetch(`/person/${person.id}/combined_credits`, apiKey);
          titles = (d.cast || [])
            .filter((r) => r.media_type === "movie" || r.media_type === "tv")
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        } else if (genre && !q) {
          const pages = await Promise.all([1, 2].map((p) => tmdbFetch(`${genre.path}&page=${p}`, apiKey).catch(() => ({}))));
          titles = pages.flatMap((d) => d.results || []).map((r) => ({ ...r, media_type: genre.type }));
        } else {
          const kind = filter === "all" ? "multi" : filter;
          const enc = encodeURIComponent(q);
          const pages = await Promise.all(
            [1, 2].map((p) => tmdbFetch(`/search/${kind}?query=${enc}&include_adult=false&page=${p}`, apiKey).catch(() => ({}))),
          );
          const all = pages.flatMap((d) => d.results || []);
          if (kind === "person" || kind === "multi")
            people = rank(all.filter((r) => (kind === "person" || r.media_type === "person") && r.profile_path), q).slice(0, 12);
          if (kind !== "person")
            titles = rank(
              all
                .filter((r) => kind !== "multi" || r.media_type === "movie" || r.media_type === "tv")
                .map((r) => ({ ...r, media_type: typeOf(r, kind) })),
              q,
            );
        }
        const seen = new Set();
        titles = titles
          .filter((r) => (r.poster_path || r.backdrop_path) && !isDisliked(r))
          .filter((r) => {
            const k = `${r.media_type}_${r.id}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .slice(0, 36);
        if (my === seq.current) setRes({ titles, people });
      } catch {
        if (my === seq.current) setRes({ titles: [], people: [] });
      }
      if (my === seq.current) setLoading(false);
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, filter, genre, person, apiKey]);

  // Saved straight away: picking a result closes the search right after
  const remember = useCallback((term) => {
    const tr = term.trim();
    if (!tr) return;
    const prev = storage.get(HISTORY_KEY) || [];
    const next = [tr, ...prev.filter((h) => norm(h) !== norm(tr))].slice(0, MAX_HISTORY);
    storage.set(HISTORY_KEY, next);
    setHistory(next);
  }, []);
  const forget = (term) =>
    setHistory((prev) => {
      const next = prev.filter((h) => h !== term);
      storage.set(HISTORY_KEY, next);
      return next;
    });
  const clearHistory = () => {
    setHistory([]);
    storage.set(HISTORY_KEY, []);
  };

  const open = (r) => {
    const q = query.trim();
    if (q) remember(q);
    recordSearchPick(r, q || person?.name || "");
    const item = { ...r, media_type: typeOf(r, "movie") };
    onClose();
    onSelect(item);
  };

  const pickGenre = (g) => {
    setPerson(null);
    setQuery("");
    setGenre((cur) => (cur?.id === g.id ? null : g));
  };
  const pickPerson = (p) => {
    const q = query.trim();
    if (q) remember(q);
    setGenre(null);
    setPerson({ id: p.id, name: p.name });
  };


  const grid = res.titles;
  const top = query.trim() && !person && !genre && filter !== "person" ? grid[0] : null;
  const rest = top ? grid.slice(1) : grid;

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (person || genre) {
        setPerson(null);
        setGenre(null);
      } else onClose();
      return;
    }
    if (!grid.length) {
      if (e.key === "Enter") remember(query);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(grid.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(grid[Math.max(0, active)]);
    }
  };
  // keep the highlighted result in view
  useEffect(() => {
    if (active < 0) return;
    document.querySelector(`[data-sr="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const heading = person ? t("search.knownFor", { name: person.name }) : genre ? genre[lang] || genre.en : null;
  const empty = !query.trim() && !genre && !person;
  const genreLabel = (g) => g[lang] || g.en;
  const typeLabel = (r) => (r.media_type === "tv" ? t("media.series") : t("media.movie"));

  return (
    <div className="vc-search" role="dialog" aria-modal="true" aria-label={t("nav.search")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vc-search__panel">
        <div className="vc-search__bar">
          <label className="vc-search__field">
            <SearchGlyph />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setPerson(null);
                setGenre(null);
                setQuery(e.target.value);
              }}
              onKeyDown={onKey}
              placeholder={t("search.placeholder")}
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={t("search.placeholder")}
            />
            {query ? (
              <button className="vc-search__icon" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label={t("search.clear")}>
                <XGlyph />
              </button>
            ) : null}
          </label>
          <button className="vc-search__cancel" onClick={onClose}>{t("search.cancel")}</button>
        </div>

        <div className="vc-search__chips" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`vc-search__chip${filter === f && !genre && !person ? " on" : ""}`}
              onClick={() => {
                setFilter(f);
                setGenre(null);
                setPerson(null);
              }}
            >
              {t(`search.filter.${f}`)}
            </button>
          ))}
        </div>

        <div className="vc-search__body">
          {offline && <p className="vc-search__note">{t("search.offline")}</p>}

          {empty && (
            <>
              {history.length > 0 && (
                <section className="vc-search__sec">
                  <div className="vc-search__head">
                    <h3>{t("search.recent")}</h3>
                    <button onClick={clearHistory}>{t("search.clear")}</button>
                  </div>
                  <div className="vc-search__recent">
                    {history.map((term) => (
                      <span key={term} className="vc-search__pill">
                        <button onClick={() => { setQuery(term); inputRef.current?.focus(); }}>
                          <ClockGlyph /> {term}
                        </button>
                        <button className="vc-search__pillx" onClick={() => forget(term)} aria-label={`${t("search.remove")} ${term}`}>
                          <XGlyph size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <section className="vc-search__sec">
                <h3>{t("search.genres")}</h3>
                <div className="vc-search__genres">
                  {GENRES.map((g) => (
                    <button key={g.id} className={`vc-search__genre g-${g.id}`} onClick={() => pickGenre(g)}>
                      {genreLabel(g)}
                    </button>
                  ))}
                </div>
              </section>

              {trending.length > 0 && (
                <section className="vc-search__sec">
                  <h3>{t("search.trending")}</h3>
                  <div className="vc-search__list">
                    {trending.map((r) => (
                      <button key={`${r.media_type}_${r.id}`} className="vc-search__row" onClick={() => open(r)}>
                        <img src={imgUrl(r.backdrop_path, "w780")} alt="" loading="lazy" />
                        <span className="vc-search__rowtext">
                          <b>{r.title || r.name}</b>
                          <span>{[typeLabel(r), year(r)].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="vc-search__play"><PlayGlyph /></span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!empty && (
            <>
              {heading && (
                <button className="vc-search__crumb" onClick={() => { setPerson(null); setGenre(null); }}>
                  <Svg size={18}><path d="M15 5l-7 7 7 7" /></Svg> {heading}
                </button>
              )}

              {loading && grid.length === 0 && res.people.length === 0 && (
                <div className="vc-search__grid">
                  {Array.from({ length: 9 }, (_, i) => <span key={i} className="vc-search__poster is-loading" />)}
                </div>
              )}

              {!loading && grid.length === 0 && res.people.length === 0 && (
                <div className="vc-search__none">
                  <p>{query.trim() ? t("search.noResults", { query: query.trim() }) : t("new.empty")}</p>
                  <span>{t("search.tryHint")}</span>
                  <div className="vc-search__genres">
                    {GENRES.slice(0, 4).map((g) => (
                      <button key={g.id} className={`vc-search__genre g-${g.id}`} onClick={() => pickGenre(g)}>{genreLabel(g)}</button>
                    ))}
                  </div>
                </div>
              )}

              {top && (
                <button className={`vc-search__top${active === 0 ? " is-active" : ""}`} data-sr={0} onClick={() => open(top)}>
                  <span className="vc-search__topart">
                    <img
                      src={imgUrl(top.backdrop_path || top.poster_path, "w1280")}
                      srcSet={top.backdrop_path ? backdropSrcSet(top.backdrop_path) : posterSrcSet(top.poster_path)}
                      sizes="(max-width: 760px) 100vw, 320px"
                      alt=""
                    />
                    <span className="vc-search__topshade" aria-hidden="true" />
                    <span className="vc-search__toptag">{t("search.topResult")}</span>
                    <span className="vc-search__toptitle">{top.title || top.name}</span>
                  </span>
                  <span className="vc-search__topmeta">
                    {[typeLabel(top), year(top), top.vote_average > 0 ? `★ ${top.vote_average.toFixed(1)}` : null].filter(Boolean).join(" · ")}
                  </span>
                  {top.overview && <span className="vc-search__topover">{top.overview}</span>}
                </button>
              )}

              {res.people.length > 0 && (
                <section className="vc-search__sec">
                  <h3>{t("search.people")}</h3>
                  <div className="vc-search__people">
                    {res.people.map((p) => (
                      <button key={p.id} className="vc-search__person" onClick={() => pickPerson(p)}>
                        <img src={imgUrl(p.profile_path, "h632")} alt="" loading="lazy" />
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {rest.length > 0 && (
                <section className="vc-search__sec">
                  {!heading && <h3>{t("search.titles")}</h3>}
                  <div className="vc-search__grid">
                    {rest.map((r, i) => {
                      const n = top ? i + 1 : i;
                      return (
                        <button
                          key={`${r.media_type}_${r.id}`}
                          data-sr={n}
                          className={`vc-search__poster${active === n ? " is-active" : ""}`}
                          onClick={() => open(r)}
                          title={r.title || r.name}
                        >
                          {r.poster_path ? (
                            <img
                              src={imgUrl(r.poster_path, "w500")}
                              srcSet={posterSrcSet(r.poster_path)}
                              sizes="(max-width: 760px) 31vw, 140px"
                              alt={r.title || r.name}
                              loading="lazy"
                            />
                          ) : (
                            <span className="vc-search__noart">{r.title || r.name}</span>
                          )}
                          <span className="vc-search__badge">{typeLabel(r)}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
