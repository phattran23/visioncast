import { useState, useEffect, useMemo, useCallback } from "react";
import MediaCard from "../components/MediaCard";
import HaloHero from "../components/HaloHero";
import { HaloRail, HaloWideCard } from "../components/HaloRail";
import { tmdbFetch } from "../utils/api";
import { useRatings, getRatingForItem } from "../utils/useRatings";
import { isRestricted } from "../utils/ageRating";
import { storage } from "../utils/storage";
import { loadHomeLayout, loadHomeViewMode } from "../utils/homeLayout";
import { useT, useLang } from "../utils/i18n";
import { buildRecommendations, buildTopGenre } from "../utils/taste";

export default function HomePage({
  trending,
  trendingTV,
  loading,
  onSelect,
  progress,
  inProgress,
  offline,
  onRetry,
  watched,
  onMarkWatched,
  onMarkUnwatched,
  history,
  apiKey,
  isSaved,
  onToggleSave,
  saved = [],
}) {
  const t = useT();
  const lang = useLang();

  const [recommendedItems, setRecommendedItems] = useState([]);
  const [topRatedItems, setTopRatedItems] = useState([]);
  const [netflixItems, setNetflixItems] = useState([]);
  const [because, setBecause] = useState(null); // { title, items }
  const [topGenre, setTopGenre] = useState(null); // { name, items }
  const [theaterItems, setTheaterItems] = useState([]);

  // Load layout config (order + visibility) once on mount
  const [layout] = useState(() => loadHomeLayout());
  const { order: rowOrder, visible: rowVisible } = layout;

  const [viewMode] = useState(() => loadHomeViewMode());

  // All items for batch ratings fetch
  const allItems = useMemo(
    () => [
      ...inProgress,
      ...trending.map((i) => ({ ...i, media_type: "movie" })),
      ...trendingTV.map((i) => ({ ...i, media_type: "tv" })),
      ...recommendedItems,
      ...topRatedItems,
      ...netflixItems,
      ...theaterItems,
      ...(because?.items || []),
      ...(topGenre?.items || []),
    ],
    [
      inProgress,
      trending,
      trendingTV,
      recommendedItems,
      topRatedItems,
      netflixItems,
      theaterItems,
      because,
      topGenre,
    ],
  );

  const { ratingsMap, ageLimitSetting } = useRatings(allItems);

  const itemRestricted = useCallback(
    (item) =>
      isRestricted(getRatingForItem(item, ratingsMap).minAge, ageLimitSetting),
    [ratingsMap, ageLimitSetting],
  );

  // Enrich ratingsMap with restricted flag for carousels
  const enrichedRatingsMap = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(ratingsMap)) {
      out[k] = { ...v, restricted: isRestricted(v.minAge, ageLimitSetting) };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratingsMap, ageLimitSetting]);

  // Filter recommended items that exceed age limit setting
  const filteredRecommendedItems = useMemo(() => {
    return recommendedItems.filter((item) => !itemRestricted(item));
  }, [recommendedItems, itemRestricted]);

  // Personalised picks from search, watchlist and watch history (utils/taste)
  useEffect(() => {
    if (!apiKey || offline) return;
    let cancelled = false;
    buildRecommendations({ apiKey, history: history || [], saved })
      .then(async ({ items, seeds, because }) => {
        if (cancelled) return;
        setRecommendedItems(items);
        setBecause(because);
        const genre = await buildTopGenre({ apiKey, seeds });
        if (!cancelled) setTopGenre(genre);
      })
      .catch((e) => console.warn("Recommendations failed", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline, history?.length, saved.length, lang]);

  // Fetch top rated movies + TV, merge and shuffle
  useEffect(() => {
    if (!apiKey || offline) return;
    const controller = new AbortController();
    Promise.all([
      tmdbFetch("/movie/top_rated?page=1", apiKey, {
        signal: controller.signal,
      }),
      tmdbFetch("/tv/top_rated?page=1", apiKey, { signal: controller.signal }),
    ])
      .then(([moviesData, tvData]) => {
        const movies = (moviesData.results || [])
          .slice(0, 8)
          .map((i) => ({ ...i, media_type: "movie" }));
        const tv = (tvData.results || [])
          .slice(0, 8)
          .map((i) => ({ ...i, media_type: "tv" }));
        // Interleave movies and TV for variety
        const merged = [];
        const max = Math.max(movies.length, tv.length);
        for (let i = 0; i < max; i++) {
          if (movies[i]) merged.push(movies[i]);
          if (tv[i]) merged.push(tv[i]);
        }
        setTopRatedItems(merged);
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.warn("Top rated fetch failed", e);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline]);

  // Movies streaming on Netflix and movies now in cinemas. Cinemas follow the
  // viewer's region (Vietnam in Vietnamese, otherwise the US); TMDB has no
  // Netflix availability data for Vietnam, so the Netflix row uses the US
  // catalogue (titles are still localised).
  useEffect(() => {
    if (!apiKey || offline) return;
    let cancelled = false;
    const region = lang === "vi" ? "VN" : "US";
    const asMovies = (d) =>
      (d.results || [])
        .filter((i) => i.poster_path)
        .slice(0, 20)
        .map((i) => ({ ...i, media_type: "movie" }));
    tmdbFetch(
      `/discover/movie?with_watch_providers=8&watch_region=US&with_watch_monetization_types=flatrate&sort_by=popularity.desc`,
      apiKey,
    )
      .then((d) => !cancelled && setNetflixItems(asMovies(d)))
      .catch(() => {});
    tmdbFetch(`/movie/now_playing?region=${region}`, apiKey)
      .then((d) => !cancelled && setTheaterItems(asMovies(d)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiKey, offline, lang]);

  // Stable pre-built item arrays for carousels, capped at 10
  const trendingMovieItems = useMemo(
    () => trending.slice(0, 10).map((i) => ({ ...i, media_type: "movie" })),
    [trending],
  );
  const trendingTVItems = useMemo(
    () => trendingTV.slice(0, 10).map((i) => ({ ...i, media_type: "tv" })),
    [trendingTV],
  );
  // Hero: up to 3 personalised picks (with artwork) first, then trending
  const heroItems = useMemo(() => {
    const out = [];
    const seen = new Set();
    const push = (item, forYou) => {
      const k = `${item.media_type}_${item.id}`;
      if (seen.has(k) || !item.backdrop_path) return;
      seen.add(k);
      out.push(forYou ? { ...item, _forYou: true } : item);
    };
    filteredRecommendedItems.slice(0, 8).forEach((i) => {
      if (out.length < 3) push(i, true);
    });
    for (let i = 0; out.length < 5 && i < 6; i++) {
      if (trendingMovieItems[i]) push(trendingMovieItems[i]);
      if (out.length < 5 && i < 2 && trendingTVItems[i]) push(trendingTVItems[i]);
    }
    return out.slice(0, 5);
  }, [filteredRecommendedItems, trendingMovieItems, trendingTVItems]);

  // Poster rail (default view) or flat grid ("list" view)
  const renderRow = (key, title, items) => {
    if (!items || items.length === 0) return null;
    const cards = items.map((item) => {
      const type = item.media_type === "tv" ? "tv" : "movie";
      const rd = enrichedRatingsMap[`${type}_${item.id}`] || {};
      return (
        <MediaCard
          key={`${item.media_type}_${item.id}`}
          item={item}
          onClick={() => onSelect(item)}
          progress={0}
          watched={watched}
          onMarkWatched={onMarkWatched}
          onMarkUnwatched={onMarkUnwatched}
          ageRating={rd.cert}
          restricted={rd.restricted}
        />
      );
    });
    if (viewMode === "list")
      return (
        <section key={key} className="halo-section">
          <div className="halo-section__head">
            <h2 className="halo-section__title">{title}</h2>
          </div>
          <div className="cards-grid halo-grid">{cards}</div>
        </section>
      );
    return (
      <HaloRail key={key} title={title}>
        {cards}
      </HaloRail>
    );
  };

  return (
    <div className="fade-in halo-home">
      {/* ── Offline ── */}
      {offline && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            gap: 16,
            color: "var(--text2)",
          }}
        >
          <div style={{ fontSize: 48 }}>📡</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>
            {t("home.offlineTitle")}
          </div>
          <div style={{ fontSize: 14, color: "var(--text3)" }}>
            {t("home.offlineBody")}
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 8 }}
            onClick={onRetry}
          >
            {t("home.retry")}
          </button>
        </div>
      )}

      {!offline && loading && (
        <div className="loader">
          <div className="spinner" />
        </div>
      )}

      {/* ── Hero (always first) ── */}
      {!loading && heroItems.length > 0 && (
        <HaloHero
          items={heroItems}
          onSelect={onSelect}
          isSaved={isSaved}
          onToggleSave={onToggleSave}
        />
      )}

      {/* ── Rows in user-configured order ── */}
      {rowOrder.map((id) => {
        if (!rowVisible[id]) return null;

        if (id === "continue") {
          if (inProgress.length === 0) return null;
          return (
            <HaloRail key="continue" title={t("home.upNext")} variant="wide">
              {inProgress.map((item) => {
                const pk =
                  item.media_type === "movie"
                    ? `movie_${item.id}`
                    : `tv_${item.id}_s${item.season}e${item.episode}`;
                return (
                  <HaloWideCard
                    key={pk}
                    item={item}
                    progress={progress[pk] || 0}
                    onClick={() => onSelect(item)}
                  />
                );
              })}
            </HaloRail>
          );
        }

        if (id === "recommended") {
          // Leave out titles already shown in "Because you searched …"
          const inBecause = new Set(
            (because?.items || []).map((i) => `${i.media_type}_${i.id}`),
          );
          const rest = filteredRecommendedItems.filter(
            (i) => !inBecause.has(`${i.media_type}_${i.id}`),
          );
          return rest.length >= 6
            ? renderRow("recommended", t("home.recommended"), rest)
            : null;
        }
        if (id === "trendingMovies")
          return renderRow("trendingMovies", t("home.trendingMovies"), trendingMovieItems);
        if (id === "trendingTV")
          return renderRow("trendingTV", t("home.trendingTV"), trendingTVItems);
        if (id === "topRated")
          return renderRow("topRated", t("home.topRated"), topRatedItems);
        if (id === "becauseSearched")
          return because
            ? renderRow(
                "becauseSearched",
                t("home.becauseSearched", { title: because.title }),
                because.items.filter((i) => !itemRestricted(i)),
              )
            : null;
        if (id === "topGenre")
          return topGenre
            ? renderRow(
                "topGenre",
                t("home.topGenre", { genre: topGenre.name.toLowerCase() }),
                topGenre.items.filter((i) => !itemRestricted(i)),
              )
            : null;
        if (id === "netflix")
          return renderRow("netflix", t("home.netflix"), netflixItems);
        if (id === "inTheaters")
          return renderRow("inTheaters", t("home.inTheaters"), theaterItems);

        return null;
      })}
    </div>
  );
}
