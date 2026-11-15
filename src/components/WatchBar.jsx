import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PLAYER_SOURCES, tmdbFetch, imgUrl } from "../utils/api";
import { useT } from "../utils/i18n";
import { storage } from "../utils/storage";
import { buildAffinity, matchScore, isDisliked } from "../utils/taste";
import { RateButtons } from "./NxPreview";

// Phone "watching" panel under the sticky player, laid out like a streaming
// app's title screen: big title, a facts line (match %, year, age, HD,
// seasons), white "next episode" button, synopsis + cast, labelled actions
// (My list · Rate · Share · More), then tabs: Episodes | More like this.
// Wide screens keep the regular detail layout (watch.css hides this).

const P = {
  next: <path d="M6 5l9 7-9 7zM17 5v14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  thumb: <path d="M7 11v9H4v-9zM7 11l4-7c1.4 0 2.3 1.1 2 2.5L12.5 10H18a2 2 0 012 2.3l-1.2 6A2 2 0 0116.8 20H7" />,
  share: (
    <>
      <path d="M12 4v11M7.5 8.5L12 4l4.5 4.5" />
      <path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" />
    </>
  ),
  rotate: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.2" transform="rotate(-90 12 12)" />
      <path d="M4 8V5h3M4 5l3 3" />
    </>
  ),
};
const Svg = ({ id, fill = false, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {P[id]}
  </svg>
);

// Open the app's quick preview (App.jsx listens)
const openPreview = (item) => window.dispatchEvent(new CustomEvent("visioncast:preview", { detail: item }));

export default function WatchBar({
  apiKey,
  type, // "movie" | "tv"
  item, // details object (id, title/name, overview, genres…)
  line, // e.g. "Mùa 1 · Tập 3 · The Pilot"
  year,
  cert,
  seasons, // number of seasons (series)
  overview,
  progressPct = 0,
  nextLabel, // e.g. "T1:T4"; omitted when there's no next episode
  onNext,
  saved,
  onSave,
  onShare,
  watched,
  onToggleWatched,
  sourceId,
  onSource,
}) {
  const t = useT();
  const rootRef = useRef(null);
  const [tab, setTab] = useState(type === "tv" ? "episodes" : "similar");
  const [more, setMore] = useState(false);
  const [sheet, setSheet] = useState(null); // "source" | "more" | null
  const [rateOpen, setRateOpen] = useState(false);
  const [extra, setExtra] = useState(null); // { cast, similar }
  const [hint, setHint] = useState(false);
  const title = item.title || item.name;

  // Cast + similar titles in one request
  useEffect(() => {
    let off = false;
    tmdbFetch(`/${type}/${item.id}?append_to_response=credits,recommendations`, apiKey, { priority: true })
      .then((r) => {
        if (off) return;
        setExtra({
          cast: (r.credits?.cast || []).slice(0, 4).map((c) => c.name),
          similar: (r.recommendations?.results || [])
            .filter((x) => x.poster_path)
            .map((x) => ({ ...x, media_type: type }))
            .filter((x) => !isDisliked(x))
            .slice(0, 18),
        });
      })
      .catch(() => !off && setExtra({ cast: [], similar: [] }));
    return () => {
      off = true;
    };
  }, [type, item.id, apiKey]);

  // Match score from the viewer's taste
  const match = useMemo(() => {
    const saved = Object.values(storage.get("saved") || {});
    const aff = buildAffinity({ history: storage.get("history") || [], saved });
    return matchScore({ ...item, media_type: type }, aff);
  }, [item, type]);

  // The page shows its episode list for the "Episodes" tab only
  useEffect(() => {
    const page = rootRef.current?.closest(".vc-title");
    if (!page) return;
    page.dataset.watchtab = tab;
    return () => delete page.dataset.watchtab;
  }, [tab]);

  // "Turn sideways for full screen", once per title, phones held upright
  useEffect(() => {
    const upright = window.matchMedia?.("(orientation: portrait) and (pointer: coarse)").matches;
    if (!upright) return;
    setHint(true);
    const id = setTimeout(() => setHint(false), 5000);
    return () => clearTimeout(id);
  }, [item.id]);

  // Synopsis: "More" only when it's longer than three lines
  const textRef = useRef(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || more) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 2);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [overview, more]);

  useEffect(() => {
    if (!sheet && !rateOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setSheet(null);
      setRateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, rateOpen]);

  const facts = [
    match && <b key="m" className="nx-match">{t("preview.match", { n: match.score })}</b>,
    year && <span key="y">{year}</span>,
    cert && <span key="c" className="vc-wb__cert">{cert}</span>,
    <span key="hd" className="vc-wb__hd">HD</span>,
    seasons > 0 && <span key="s">{t("preview.seasons", { n: seasons })}</span>,
  ].filter(Boolean);

  const source = PLAYER_SOURCES.find((s) => s.id === sourceId);

  return (
    <section className="vc-watchbar" ref={rootRef} aria-label={title}>
      {progressPct > 0 && (
        <div className="vc-wb__progress" aria-hidden="true">
          <span style={{ width: `${Math.min(100, progressPct)}%` }} />
        </div>
      )}
      {hint && (
        <button className="vc-wb__hint" onClick={() => setHint(false)}>
          <Svg id="rotate" size={18} /> {t("watch.rotate")}
        </button>
      )}

      <div className="vc-wb__body">
        <h1 className="vc-wb__title">{title}</h1>
        <p className="vc-wb__facts">{facts}</p>
        {line && <p className="vc-wb__line">{line}</p>}

        {nextLabel && onNext && (
          <button className="vc-wb__primary" onClick={onNext}>
            <Svg id="next" fill size={22} /> {t("watch.nextEp", { ep: nextLabel })}
          </button>
        )}

        {overview && (
          <p ref={textRef} className={`vc-wb__overview${more ? " is-open" : ""}`} onClick={() => (clamped || more) && setMore((m) => !m)}>
            {overview}
          </p>
        )}
        {(clamped || more) && (
          <button className="vc-wb__moretext" onClick={() => setMore((m) => !m)}>
            {more ? t("watch.less") : t("watch.more")}
          </button>
        )}
        {extra?.cast?.length > 0 && (
          <p className="vc-wb__cast">
            <span>{t("preview.cast")}:</span> {extra.cast.join(", ")}
          </p>
        )}

        <div className="vc-wb__actions">
          {onSave && (
            <button className={`vc-wb__act${saved ? " on" : ""}`} onClick={onSave} aria-pressed={!!saved}>
              <Svg id={saved ? "check" : "plus"} />
              <span>{t("hero.myList")}</span>
            </button>
          )}
          <button className={`vc-wb__act${rateOpen ? " on" : ""}`} onClick={() => setRateOpen((v) => !v)} aria-expanded={rateOpen}>
            <Svg id="thumb" />
            <span>{t("watch.rate")}</span>
          </button>
          {onShare && (
            <button className="vc-wb__act" onClick={onShare}>
              <Svg id="share" />
              <span>{t("share.button")}</span>
            </button>
          )}
          <button className="vc-wb__act" onClick={() => setSheet("more")} aria-haspopup="dialog">
            <Svg id="more" />
            <span>{t("watch.moreActions")}</span>
          </button>
        </div>
        {rateOpen && (
          <div className="vc-wb__rate">
            <RateButtons item={{ ...item, media_type: type }} />
          </div>
        )}
      </div>

      <div className="vc-wb__tabs" role="tablist">
        {type === "tv" && (
          <button role="tab" aria-selected={tab === "episodes"} className={`vc-wb__tab${tab === "episodes" ? " on" : ""}`} onClick={() => setTab("episodes")}>
            {t("watch.tabEpisodes")}
          </button>
        )}
        <button role="tab" aria-selected={tab === "similar"} className={`vc-wb__tab${tab === "similar" ? " on" : ""}`} onClick={() => setTab("similar")}>
          {t("watch.tabSimilar")}
        </button>
      </div>

      {tab === "similar" && (
        <div className="vc-wb__grid">
          {extra === null ? (
            Array.from({ length: 6 }, (_, i) => <span key={i} className="vc-wb__poster is-loading" />)
          ) : extra.similar.length === 0 ? (
            <p className="vc-wb__empty">{t("new.empty")}</p>
          ) : (
            extra.similar.map((s) => (
              <button key={s.id} className="vc-wb__poster" onClick={() => openPreview(s)} aria-label={s.title || s.name}>
                <img src={imgUrl(s.poster_path, "w342")} alt="" loading="lazy" />
              </button>
            ))
          )}
        </div>
      )}

      {sheet && (
        <div className="vc-watchsheet" role="dialog" aria-modal="true" onClick={() => setSheet(null)}>
          <div className="vc-watchsheet__panel" onClick={(e) => e.stopPropagation()}>
            <div className="vc-watchsheet__grab" aria-hidden="true" />
            {sheet === "more" ? (
              <>
                <h2>{title}</h2>
                {onToggleWatched && (
                  <button className={`vc-watchsheet__item${watched ? " on" : ""}`} onClick={() => { onToggleWatched(); setSheet(null); }}>
                    <span>{watched ? t("watch.watchedUndo") : t("watch.markWatched")}</span>
                    {watched && <Svg id="check" size={20} />}
                  </button>
                )}
                {onSource && (
                  <button className="vc-watchsheet__item" onClick={() => setSheet("source")}>
                    <span>{t("watch.source")}</span>
                    <span className="vc-watchsheet__value">{source?.label} ›</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <h2>{t("watch.source")}</h2>
                {PLAYER_SOURCES.map((s) => (
                  <button
                    key={s.id}
                    className={`vc-watchsheet__item${s.id === sourceId ? " on" : ""}`}
                    onClick={() => {
                      setSheet(null);
                      if (s.id !== sourceId) onSource(s.id);
                    }}
                  >
                    <span>{s.label}</span>
                    {s.id === sourceId && <Svg id="check" size={20} />}
                  </button>
                ))}
                <p className="vc-watchsheet__hint">{t("watch.sourceHint")}</p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
