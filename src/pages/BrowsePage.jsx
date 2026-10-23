import { useState, useEffect } from "react";
import MediaCard from "../components/MediaCard";
import { HaloRail, HaloWideCard } from "../components/HaloRail";
import FilterBar, { useCountryNames } from "../components/FilterBar";
import { tmdbFetch, imgUrl } from "../utils/api";
import { useT, useLang } from "../utils/i18n";

// Films / Series browse pages (opened from the dock), per the "VisionCast —
// Films & Series filters" design: big title over an ambient glow, a sticky
// glass filter bar (genre + country, multi-select, plus sort), removable
// chips and a results grid. Without filters the page shows TMDB rails.

const ROWS = {
  movie: [
    { key: "browse.popular", path: "/movie/popular" },
    { key: "browse.inTheaters", path: (region) => `/movie/now_playing?region=${region}` },
    { key: "browse.topRated", path: "/movie/top_rated" },
    {
      key: "browse.netflix",
      path: "/discover/movie?with_watch_providers=8&watch_region=US&with_watch_monetization_types=flatrate&sort_by=popularity.desc",
    },
    { genre: 28 },
    { genre: 35 },
    { genre: 16 },
    { genre: 878 },
    { genre: 27 },
    { genre: 10749 },
  ],
  tv: [
    { key: "browse.popular", path: "/tv/popular" },
    { key: "browse.onTheAir", path: "/tv/on_the_air" },
    { key: "browse.topRated", path: "/tv/top_rated" },
    { key: "browse.netflixSeries", path: "/discover/tv?with_networks=213&sort_by=popularity.desc" },
    { key: "browse.kdrama", path: "/discover/tv?with_origin_country=KR&with_genres=18&sort_by=popularity.desc&vote_count.gte=100" },
    { key: "browse.anime", path: "/discover/tv?with_origin_country=JP&with_genres=16&sort_by=popularity.desc&vote_count.gte=100" },
    { genre: 18 },
    { genre: 80 },
    { genre: 35 },
    { genre: 10765 },
  ],
};

const SORTS = {
  popular: { key: "filter.popular", movie: "popularity.desc", tv: "popularity.desc", extra: "" },
  rated: { key: "filter.topRated", movie: "vote_average.desc", tv: "vote_average.desc", extra: "&vote_count.gte=200" },
  newest: { key: "filter.newest", movie: "primary_release_date.desc", tv: "first_air_date.desc", extra: "&vote_count.gte=10" },
};

const genrePath = (type, id) =>
  `/discover/${type}?with_genres=${id}&sort_by=popularity.desc&vote_count.gte=300`;

const today = () => new Date().toISOString().slice(0, 10);
const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function BrowsePage({
  type,
  apiKey,
  onSelect,
  watched,
  onMarkWatched,
  onMarkUnwatched,
}) {
  const t = useT();
  const lang = useLang();
  const countryName = useCountryNames();
  const [genres, setGenres] = useState([]);
  const [rows, setRows] = useState([]);

  // Filters (genres and countries are multi-select, matched with OR)
  const [selGenres, setSelGenres] = useState([]);
  const [selCountries, setSelCountries] = useState([]);
  const [sort, setSort] = useState("popular");
  const [open, setOpen] = useState(null);
  const filtered = selGenres.length + selCountries.length > 0 || sort !== "popular";
  const [results, setResults] = useState([]);
  const [pageNo, setPageNo] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);

  const genreName = (id) => genres.find((g) => g.id === id)?.name;

  // Genre list + default rails
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    const region = lang === "vi" ? "VN" : "US";
    setRows([]);
    (async () => {
      const g = await tmdbFetch(`/genre/${type}/list`, apiKey).catch(() => ({ genres: [] }));
      if (cancelled) return;
      setGenres(g.genres || []);
      const name = (id) => (g.genres || []).find((x) => x.id === id)?.name;
      const defs = ROWS[type].map((r, i) => ({
        id: `${type}-${i}`,
        title: r.genre ? name(r.genre) : t(r.key),
        path: r.genre ? genrePath(type, r.genre) : typeof r.path === "function" ? r.path(region) : r.path,
      }));
      const lists = await Promise.all(
        defs.map((d) =>
          d.title
            ? tmdbFetch(d.path, apiKey)
                .then((res) =>
                  (res.results || [])
                    .filter((i) => i.poster_path)
                    .slice(0, 20)
                    .map((i) => ({ ...i, media_type: type })),
                )
                .catch(() => [])
            : [],
        ),
      );
      if (!cancelled)
        setRows(defs.map((d, i) => ({ ...d, items: lists[i] })).filter((r) => r.items.length >= 4));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, type, lang]);

  // Filtered results: first page whenever a filter changes (live)
  const discoverPath = (p) => {
    const s = SORTS[sort];
    const dateField = type === "tv" ? "first_air_date.lte" : "primary_release_date.lte";
    return (
      `/discover/${type}?sort_by=${s[type]}${s.extra}&page=${p}&${dateField}=${today()}` +
      (selGenres.length ? `&with_genres=${selGenres.join("|")}` : "") +
      (selCountries.length ? `&with_origin_country=${selCountries.join("|")}` : "")
    );
  };
  const asItems = (d) =>
    (d.results || [])
      .filter((i) => (type === "tv" ? i.backdrop_path || i.poster_path : i.poster_path))
      .map((i) => ({ ...i, media_type: type }));

  useEffect(() => {
    if (!apiKey || !filtered) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      tmdbFetch(discoverPath(1), apiKey)
        .then((d) => {
          if (cancelled) return;
          setResults(asItems(d));
          setPageNo(1);
          setTotalPages(Math.min(d.total_pages || 1, 50));
          setTotalResults(d.total_results || 0);
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, type, selGenres.join(), selCountries.join(), sort, lang]);

  const loadMore = () => {
    if (loading || pageNo >= totalPages) return;
    setLoading(true);
    tmdbFetch(discoverPath(pageNo + 1), apiKey)
      .then((d) => {
        setResults((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...asItems(d).filter((i) => !seen.has(i.id))];
        });
        setPageNo((n) => n + 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const reset = () => {
    setSelGenres([]);
    setSelCountries([]);
    setSort("popular");
  };

  const fmt = (n) => n.toLocaleString(lang === "vi" ? "vi-VN" : "en-US");
  const countLabel = filtered
    ? t(type === "tv" ? "filter.countSeries" : "filter.countFilms", { n: fmt(totalResults) })
    : t(type === "tv" ? "filter.allSeries" : "filter.allFilms");

  // "Country · Genre, Genre" (series) / "Year · Genre, Genre" (films)
  const metaFor = (item) => {
    const g = (item.genre_ids || []).map(genreName).filter(Boolean).slice(0, 2).join(", ");
    const lead =
      type === "tv"
        ? (item.origin_country || []).slice(0, 1).map(countryName).join("")
        : (item.release_date || "").slice(0, 4);
    return [lead, g].filter(Boolean).join(" · ");
  };

  const ambient = (filtered ? results[0] : rows[0]?.items[0])?.backdrop_path;

  return (
    <div className="fade-in vc-browse">
      {ambient && (
        <div className="vc-browse__ambient" aria-hidden="true">
          <img src={imgUrl(ambient, "w780")} alt="" />
        </div>
      )}

      <header className="vc-browse__head">
        <h1>{t(type === "tv" ? "nav.series" : "nav.films")}</h1>
        <p>{t("filter.subtitle")}</p>
      </header>

      <div className="vc-browse__filters">
        <FilterBar
          genres={genres}
          selGenres={selGenres}
          selCountries={selCountries}
          sort={sort}
          sorts={SORTS}
          open={open}
          onOpen={setOpen}
          onToggleGenre={(id) => setSelGenres((l) => toggleIn(l, id))}
          onToggleCountry={(c) => setSelCountries((l) => toggleIn(l, c))}
          onClearGenres={() => setSelGenres([])}
          onClearCountries={() => setSelCountries([])}
          onSort={setSort}
          onReset={reset}
          countLabel={countLabel}
          loading={filtered && loading}
        />
      </div>

      {filtered ? (
        <section className="vc-results">
          {!loading && results.length === 0 ? (
            <div className="vc-results__empty glass">
              <div className="vc-results__empty-title">{t("filter.none")}</div>
              <div className="vc-results__empty-sub">{t("filter.noneSub")}</div>
              <button type="button" className="vc-flink" onClick={reset}>
                {t("filter.resetAll")}
              </button>
            </div>
          ) : type === "tv" ? (
            <div className="vc-results__grid vc-results__grid--wide">
              {results.map((item, i) => (
                <div key={item.id} className="vc-results__cell" style={{ animationDelay: `${Math.min(i, 12) * 0.05}s` }}>
                  <HaloWideCard item={item} onClick={() => onSelect(item)} meta={metaFor(item)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="vc-results__grid">
              {results.map((item, i) => (
                <div key={item.id} className="vc-results__cell" style={{ animationDelay: `${Math.min(i, 12) * 0.05}s` }}>
                  <MediaCard
                    item={item}
                    onClick={() => onSelect(item)}
                    progress={0}
                    watched={watched}
                    onMarkWatched={onMarkWatched}
                    onMarkUnwatched={onMarkUnwatched}
                    meta={metaFor(item)}
                  />
                </div>
              ))}
            </div>
          )}
          {pageNo < totalPages && results.length > 0 && (
            <div className="vc-results__more">
              <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loading}>
                {loading ? t("auth.busy") : t("filter.loadMore")}
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {rows.length === 0 && (
            <div className="loader">
              <div className="spinner" />
            </div>
          )}
          {rows.map((r) => (
            <HaloRail key={r.id} title={r.title}>
              {r.items.map((item) => (
                <MediaCard
                  key={`${type}_${item.id}`}
                  item={item}
                  onClick={() => onSelect(item)}
                  progress={0}
                  watched={watched}
                  onMarkWatched={onMarkWatched}
                  onMarkUnwatched={onMarkUnwatched}
                />
              ))}
            </HaloRail>
          ))}
        </>
      )}
    </div>
  );
}
