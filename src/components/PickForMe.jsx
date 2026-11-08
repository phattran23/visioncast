import { useCallback, useEffect, useRef, useState } from "react";
import { imgUrl, tmdbFetch } from "../utils/api";
import { PlayIcon } from "./Icons";
import { useT } from "../utils/i18n";
import { matchScore, getRatings } from "../utils/taste";

// "Pick for me": choose a mood and how much time you have; we pull a few
// well-rated pages from TMDB, drop what you've seen or disliked, rank by how
// well each title fits your taste (with a little randomness) and show one.

const MOODS = [
  { id: "any", movie: "", tv: "" },
  { id: "laugh", movie: "35", tv: "35" },
  { id: "action", movie: "28|12", tv: "10759" },
  { id: "thrill", movie: "53|9648|80", tv: "9648|80" },
  { id: "romance", movie: "10749", tv: "18" },
  { id: "family", movie: "10751|16", tv: "10751|16" },
  { id: "scary", movie: "27", tv: "9648" },
  { id: "mind", movie: "878|14", tv: "10765" },
];
const LENGTHS = ["any", "short", "series"];

const keyOf = (i) => `${i.media_type === "tv" ? "tv" : "movie"}_${i.id}`;

export default function PickForMe({ apiKey, aff, history = [], onClose, onPlay, onPreview }) {
  const t = useT();
  const [mood, setMood] = useState("any");
  const [len, setLen] = useState("any");
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const shown = useRef(new Set());
  const pool = useRef({ sig: null, items: [] });

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roll = useCallback(async () => {
    setBusy(true);
    setEmpty(false);
    const type = len === "series" ? "tv" : len === "short" ? "movie" : Math.random() < 0.65 ? "movie" : "tv";
    const sig = `${mood}|${len}|${type}`;
    try {
      if (pool.current.sig !== sig || pool.current.items.length < 3) {
        const g = MOODS.find((m) => m.id === mood)?.[type] || "";
        const pages = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
        const lists = await Promise.all(
          [...new Set(pages)].map((p) =>
            tmdbFetch(
              `/discover/${type}?sort_by=popularity.desc&vote_average.gte=6.8&vote_count.gte=250&include_adult=false&page=${p}` +
                (g ? `&with_genres=${encodeURIComponent(g)}` : "") +
                (len === "short" ? "&with_runtime.lte=105&with_runtime.gte=60" : ""),
              apiKey,
            )
              .then((d) => d.results || [])
              .catch(() => []),
          ),
        );
        const seen = new Set([...history.map(keyOf), ...Object.keys(getRatings())]);
        const items = lists
          .flat()
          .map((i) => ({ ...i, media_type: type }))
          .filter((i) => i.backdrop_path && !seen.has(keyOf(i)));
        pool.current = { sig, items };
      }
      const fresh = pool.current.items.filter((i) => !shown.current.has(keyOf(i)));
      if (!fresh.length) {
        setEmpty(true);
        setPick(null);
        return;
      }
      // Fit + rating + randomness, then take one of the best few
      const ranked = fresh
        .map((i) => ({ i, s: (matchScore(i, aff)?.score || 60) + i.vote_average * 2 + Math.random() * 18 }))
        .sort((a, b) => b.s - a.s);
      const choice = ranked[Math.floor(Math.random() * Math.min(3, ranked.length))].i;
      shown.current.add(keyOf(choice));
      setPick(choice);
    } finally {
      setBusy(false);
    }
  }, [mood, len, apiKey, aff, history]);

  // New filters → new pick
  useEffect(() => {
    roll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, len]);

  const m = pick ? matchScore(pick, aff) : null;

  return (
    <div className="nx-modal" role="dialog" aria-modal="true" aria-label={t("pick.title")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nx-pick">
        <button className="nx-preview__close" onClick={onClose} aria-label={t("preview.close")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <h2 className="nx-pick__title">{t("pick.title")}</h2>
        <p className="nx-pick__sub">{t("pick.sub")}</p>

        <div className="nx-pick__group" role="group" aria-label={t("pick.mood")}>
          {MOODS.map((o) => (
            <button key={o.id} className={`nx-chip${mood === o.id ? " on" : ""}`} onClick={() => setMood(o.id)} aria-pressed={mood === o.id}>
              {t(`pick.mood.${o.id}`)}
            </button>
          ))}
        </div>
        <div className="nx-pick__group" role="group" aria-label={t("pick.length")}>
          {LENGTHS.map((o) => (
            <button key={o} className={`nx-chip nx-chip--soft${len === o ? " on" : ""}`} onClick={() => setLen(o)} aria-pressed={len === o}>
              {t(`pick.len.${o}`)}
            </button>
          ))}
        </div>

        <div className={`nx-pick__card${busy ? " is-busy" : ""}`} aria-live="polite">
          {pick ? (
            <>
              <button className="nx-pick__art" onClick={() => onPreview(pick)} aria-label={pick.title || pick.name}>
                <img key={pick.id} src={imgUrl(pick.backdrop_path, "w1280")} alt="" />
                <span className="nx-pick__shade" aria-hidden="true" />
                <span className="nx-pick__name">{pick.title || pick.name}</span>
              </button>
              <p className="nx-preview__facts">
                {m && <b className="nx-match">{t("preview.match", { n: m.score })}</b>}
                <span>{(pick.release_date || pick.first_air_date || "").slice(0, 4)}</span>
                <span>{pick.media_type === "tv" ? t("media.series") : t("media.movie")}</span>
                <span>★ {pick.vote_average?.toFixed(1)}</span>
              </p>
              {pick.overview && <p className="nx-pick__text">{pick.overview}</p>}
              <div className="nx-pick__actions">
                <button className="nx-btn nx-btn--play" onClick={() => onPlay(pick)}>
                  <PlayIcon /> {t("hero.play")}
                </button>
                <button className="nx-btn nx-btn--info" onClick={roll} disabled={busy}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg>
                  {t("pick.another")}
                </button>
              </div>
            </>
          ) : empty ? (
            <p className="nx-pick__empty">{t("pick.empty")}</p>
          ) : (
            <div className="nx-pick__skeleton" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}
