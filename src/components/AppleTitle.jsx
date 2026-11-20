import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { imgUrl, posterSrcSet, backdropSrcSet, tmdbFetch } from "../utils/api";
import { useT, useLang } from "../utils/i18n";
import { useTitleArt, genreNames } from "./NxBrowse";
import { isDisliked } from "../utils/taste";

// Phone title page (not playing): full-bleed key art with floating back /
// share buttons, status chip, title logo, genre line, pill Play + round "+",
// synopsis with MORE, facts line; then episodes (series) as large cards,
// trailers, related titles and cast. Wide screens keep the regular page.

const Svg = ({ children, size = 22, sw = 2, fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const Play = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>;
const Chev = () => <Svg size={18} sw={2.4}><path d="M9 5l7 7-7 7" /></Svg>;

const fmtMin = (min, lang) => {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return lang === "vi" ? `${h ? `${h} giờ ` : ""}${m} phút` : `${h ? `${h}h ` : ""}${m}m`;
};

const openPreview = (item) => window.dispatchEvent(new CustomEvent("visioncast:preview", { detail: item }));

function Section({ title, more = false, children }) {
  return (
    <section className="vc-at__sec">
      <h2 className="vc-at__h2">
        {title}
        {more && <Chev />}
      </h2>
      {children}
    </section>
  );
}

export default function AppleTitle({
  apiKey,
  type, // "movie" | "tv"
  item, // details
  cert,
  saved,
  onSave,
  onShare,
  primaryLabel,
  onPrimary, // null → disabled
  // series
  seasons = [],
  season,
  onSeason,
  episodes = [],
  onEpisode,
  epProgress, // (ep) => pct
  restricted = false, // age-limited: no autoplaying trailer
  currentEp, // episode_number playing / to resume
}) {
  const t = useT();
  const lang = useLang();
  const art = useTitleArt({ ...item, media_type: type }, apiKey);
  const [extra, setExtra] = useState(null);
  const [more, setMore] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const textRef = useRef(null);

  // ── Muted trailer in the hero (like a streaming app's title page) ──────
  // Starts a moment after the artwork shows, fades in only once YouTube is
  // really playing and its start-up overlay has gone, pauses while the hero
  // is scrolled away. Skipped for age-limited titles and on data saver.
  const heroRef = useRef(null);
  const ytRef = useRef(null);
  const ytHeard = useRef(false);
  const ytHello = useRef(null);
  const ytReveal = useRef(null);
  const [yt, setYt] = useState("off"); // off | loading | playing | failed
  const [ytOn, setYtOn] = useState(false); // iframe mounted
  const [muted, setMuted] = useState(true);
  const heroVideo = extra?.videos?.find((v) => v.type === "Trailer") || extra?.videos?.find((v) => v.type === "Teaser") || null;
  const saveData = typeof navigator !== "undefined" && navigator.connection?.saveData;
  const ytCmd = (func, args = []) =>
    ytRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");

  useEffect(() => {
    if (!heroVideo || restricted || saveData) return;
    setYt("loading");
    setMuted(true);
    ytHeard.current = false;
    const start = setTimeout(() => setYtOn(true), 1200);
    const onMsg = (e) => {
      if (!ytRef.current || e.source !== ytRef.current.contentWindow) return;
      let m = e.data;
      try {
        m = typeof m === "string" ? JSON.parse(m) : m;
      } catch {
        return;
      }
      if (!m || typeof m !== "object") return;
      if (!ytHeard.current) {
        ytHeard.current = true;
        clearInterval(ytHello.current);
        ytCmd("addEventListener", ["onStateChange"]);
        ytCmd("addEventListener", ["onError"]);
      }
      if (m.event === "onReady") {
        ytCmd("mute");
        ytCmd("playVideo");
      }
      const state = m.event === "onStateChange" ? m.info : m.info?.playerState;
      if (state === 1 && !ytReveal.current)
        ytReveal.current = setTimeout(() => setYt((s) => (s === "loading" ? "playing" : s)), 3000);
      if (m.event === "onError") setYt("failed");
    };
    window.addEventListener("message", onMsg);
    return () => {
      clearTimeout(start);
      clearInterval(ytHello.current);
      clearTimeout(ytReveal.current);
      ytReveal.current = null;
      window.removeEventListener("message", onMsg);
      setYtOn(false);
      setYt("off");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroVideo?.key, restricted, saveData]);

  const onYtLoad = () => {
    const w = ytRef.current?.contentWindow;
    if (!w) return;
    clearInterval(ytHello.current);
    let n = 0;
    const hello = () => {
      if (ytHeard.current || ++n > 60) return clearInterval(ytHello.current);
      w.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
    };
    hello();
    ytHello.current = setInterval(hello, 250);
  };

  // Pause while the hero is out of view, carry on when it's back
  useEffect(() => {
    const el = heroRef.current;
    if (!el || !ytOn || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => ytCmd(e.intersectionRatio > 0.35 ? "playVideo" : "pauseVideo"),
      { threshold: [0, 0.35, 0.7] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ytOn]);

  const toggleMute = () => {
    if (muted) {
      ytCmd("unMute");
      ytCmd("setVolume", [100]);
      ytCmd("playVideo");
    } else ytCmd("mute");
    setMuted(!muted);
  };
  const title = item.title || item.name;

  useEffect(() => {
    let off = false;
    const vl = lang === "vi" ? "vi,en,null" : "en,null";
    tmdbFetch(`/${type}/${item.id}?append_to_response=videos,credits,recommendations&include_video_language=${vl}`, apiKey, { priority: true })
      .then((r) => {
        if (off) return;
        const vids = (r.videos?.results || []).filter((v) => v.site === "YouTube" && v.key);
        vids.sort((a, b) => (a.type === "Trailer" ? -1 : 0) - (b.type === "Trailer" ? -1 : 0));
        setExtra({
          videos: vids.slice(0, 8),
          cast: (r.credits?.cast || []).filter((c) => c.profile_path).slice(0, 15),
          related: (r.recommendations?.results || [])
            .filter((x) => x.poster_path)
            .map((x) => ({ ...x, media_type: type }))
            .filter((x) => !isDisliked(x))
            .slice(0, 15),
          status: r.status,
          next: r.next_episode_to_air,
        });
      })
      .catch(() => !off && setExtra({ videos: [], cast: [], related: [] }));
    return () => {
      off = true;
    };
  }, [type, item.id, apiKey, lang]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || more) return;
    setClamped(el.scrollHeight > el.clientHeight + 2);
  }, [item.overview, more]);

  useEffect(() => {
    if (!trailer) return;
    const onKey = (e) => e.key === "Escape" && setTrailer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trailer]);

  // Status chip
  const fmtDate = (raw) => {
    const d = new Date(`${raw}T00:00:00`);
    return lang === "vi" ? `${d.getDate()} Th${d.getMonth() + 1}` : d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  };
  let chip = null;
  const today = new Date().toISOString().slice(0, 10);
  if (type === "tv") {
    const next = extra?.next || item.next_episode_to_air;
    const status = extra?.status || item.status;
    if (next?.air_date && next.air_date >= today) chip = t("at.newEp", { date: fmtDate(next.air_date) });
    else if (status === "Ended" || status === "Canceled") chip = t("at.ended");
    else if (status) chip = t("at.airing");
  } else if (item.release_date && item.release_date > today) {
    chip = t("new.releases", { date: fmtDate(item.release_date) });
  }

  const pic = art.textless || item.poster_path;
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const length = type === "movie" ? fmtMin(item.runtime, lang) : item.number_of_seasons ? t("preview.seasons", { n: item.number_of_seasons }) : null;

  return (
    <div className="vc-at">
      {/* Floating buttons */}
      <button className="vc-at__fab vc-at__fab--back" onClick={() => window.dispatchEvent(new Event("visioncast:back"))} aria-label={t("nav.back")}>
        <Svg size={24} sw={2.3}><path d="M15 5l-7 7 7 7" /></Svg>
      </button>
      {onShare && (
        <button className="vc-at__fab vc-at__fab--share" onClick={onShare} aria-label={t("share.button")}>
          <Svg size={22} sw={2}><path d="M12 4v11M7.5 8.5L12 4l4.5 4.5" /><path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" /></Svg>
        </button>
      )}

      <div className="vc-at__hero" ref={heroRef}>
        {pic ? (
          art.textless || !item.backdrop_path ? (
            <img className="vc-at__art" src={imgUrl(pic, "w780")} srcSet={posterSrcSet(pic)} sizes="100vw" alt="" />
          ) : (
            <img className="vc-at__art" src={imgUrl(item.backdrop_path, "w1280")} srcSet={backdropSrcSet(item.backdrop_path)} sizes="100vw" alt="" />
          )
        ) : null}
        {ytOn && heroVideo && yt !== "failed" && (
          <iframe
            ref={ytRef}
            className={`vc-at__yt${yt === "playing" ? " is-playing" : ""}`}
            src={`https://www.youtube-nocookie.com/embed/${heroVideo.key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${heroVideo.key}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
            title={`${title} trailer`}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            aria-hidden="true"
            onLoad={onYtLoad}
          />
        )}
        <div className="vc-at__shade" aria-hidden="true" />
        {yt === "playing" && (
          <button className="vc-at__mute" onClick={toggleMute} aria-label={muted ? t("preview.unmute") : t("preview.mute")}>
            {muted ? (
              <Svg size={20} sw={1.9}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></Svg>
            ) : (
              <Svg size={20} sw={1.9}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /></Svg>
            )}
          </button>
        )}
        <div className="vc-at__info">
          {chip && <span className="vc-at__chip">{chip}</span>}
          <h1 className="vc-at__title">
            {art.logo ? <img src={imgUrl(art.logo, "w500")} alt={title} /> : title}
          </h1>
          <p className="vc-at__genres">
            {[type === "tv" ? t("media.series") : t("media.movie"), ...genreNames(item, lang, 2)].join(" · ")}
          </p>
          <div className="vc-at__actions">
            <button className="vc-at__play" onClick={onPrimary || undefined} disabled={!onPrimary}>
              <Play /> {primaryLabel}
            </button>
            {onSave && (
              <button className={`vc-at__round${saved ? " on" : ""}`} onClick={onSave} aria-pressed={!!saved} aria-label={t(saved ? "hero.remove" : "hero.add", { title })}>
                {saved ? <Svg sw={2.4}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg> : <Svg sw={2.2}><path d="M12 5v14M5 12h14" /></Svg>}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="vc-at__about">
        {item.overview && (
          <div className="vc-at__overview-wrap">
            <p ref={textRef} className={`vc-at__overview${more ? " is-open" : ""}`}>{item.overview}</p>
            {(clamped || more) && (
              <button className="vc-at__more" onClick={() => setMore((m) => !m)}>{more ? t("watch.less") : t("at.more")}</button>
            )}
          </div>
        )}
        <p className="vc-at__facts">
          {[year, length].filter(Boolean).join(" · ")}
          {cert && <span className="vc-at__box">{cert}</span>}
          <span className="vc-at__box vc-at__box--fill">HD</span>
          <span className="vc-at__box">CC</span>
        </p>
      </div>

      {type === "tv" && episodes.length > 0 && (
        <Section title={t("watch.season", { n: season })}>
          {seasons.length > 1 && (
            <div className="vc-at__seasons">
              {seasons.map((s) => (
                <button key={s.season_number} className={`vc-at__season${s.season_number === season ? " on" : ""}`} onClick={() => onSeason(s.season_number)}>
                  {t("watch.season", { n: s.season_number })}
                </button>
              ))}
            </div>
          )}
          <div className="vc-at__rail">
            {episodes.map((ep) => {
              const pct = epProgress?.(ep) || 0;
              return (
                <button key={ep.episode_number} className={`vc-at__ep${ep.episode_number === currentEp ? " is-current" : ""}`} onClick={() => onEpisode(ep)}>
                  {ep.still_path ? (
                    <img src={imgUrl(ep.still_path, "w780")} srcSet={`${imgUrl(ep.still_path, "w300")} 300w, ${imgUrl(ep.still_path, "original")} 1280w`} sizes="84vw" alt="" loading="lazy" />
                  ) : (
                    <span className="vc-at__epempty" />
                  )}
                  <span className="vc-at__epshade" aria-hidden="true" />
                  <span className="vc-at__eptext">
                    <span className="vc-at__epnum">{t("at.episode", { n: ep.episode_number })}</span>
                    <b>{ep.name}</b>
                    {ep.overview && <span className="vc-at__epdesc">{ep.overview}</span>}
                    <span className="vc-at__epfoot">
                      <Play size={14} /> {fmtMin(ep.runtime, lang) || t("hero.play")}
                      {pct > 2 && (
                        <span className="vc-at__epbar"><span style={{ width: `${Math.min(pct, 100)}%` }} /></span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {extra?.videos?.length > 0 && (
        <Section title={t("at.trailers")} more>
          <div className="vc-at__rail">
            {extra.videos.map((v) => (
              <button key={v.key} className="vc-at__vid" onClick={() => setTrailer(v)}>
                {/* 16:9 thumbnail without letterbox bars; smaller 16:9 one as fallback */}
                <img
                  src={`https://i.ytimg.com/vi/${v.key}/maxresdefault.jpg`}
                  onError={(e) => {
                    if (!e.currentTarget.dataset.fb) {
                      e.currentTarget.dataset.fb = "1";
                      e.currentTarget.src = `https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`;
                    }
                  }}
                  onLoad={(e) => {
                    // YouTube answers a missing maxres image with a 120x90 placeholder
                    if (e.currentTarget.naturalWidth <= 120 && !e.currentTarget.dataset.fb) {
                      e.currentTarget.dataset.fb = "1";
                      e.currentTarget.src = `https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`;
                    }
                  }}
                  alt=""
                  loading="lazy"
                />
                <span className="vc-at__epshade" aria-hidden="true" />
                <span className="vc-at__vidtext">
                  <b>{v.name}</b>
                  <span><Play size={14} /> {v.type}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {extra?.related?.length > 0 && (
        <Section title={t("at.related")} more>
          <div className="vc-at__rail vc-at__rail--posters">
            {extra.related.map((r) => (
              <button key={r.id} className="vc-at__poster" onClick={() => openPreview(r)} aria-label={r.title || r.name}>
                <img src={imgUrl(r.poster_path, "w500")} srcSet={posterSrcSet(r.poster_path)} sizes="36vw" alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </Section>
      )}

      {extra?.cast?.length > 0 && (
        <Section title={t("search.people")} more>
          <div className="vc-at__rail vc-at__rail--cast">
            {extra.cast.map((c) => (
              <div key={c.credit_id || c.id} className="vc-at__person">
                <img src={imgUrl(c.profile_path, "w185")} alt="" loading="lazy" />
                <b>{c.name}</b>
                {c.character && <span>{c.character}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {trailer && (
        <div className="vc-at__trailer" role="dialog" aria-modal="true" aria-label={trailer.name} onClick={() => setTrailer(null)}>
          <div className="vc-at__trailerbox" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&playsinline=1&rel=0&modestbranding=1`}
              title={trailer.name}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          </div>
          <button className="vc-at__trailerx" onClick={() => setTrailer(null)} aria-label={t("preview.close")}>
            <Svg size={22}><path d="M6 6l12 12M18 6L6 18" /></Svg>
          </button>
        </div>
      )}
    </div>
  );
}
