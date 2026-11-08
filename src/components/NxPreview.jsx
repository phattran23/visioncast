import { useEffect, useMemo, useRef, useState } from "react";
import { imgUrl, tmdbFetch } from "../utils/api";
import { PlayIcon } from "./Icons";
import { useT, useLang } from "../utils/i18n";
import { getRating, rateTitle, matchScore, isDisliked } from "../utils/taste";

// Quick look at a title without leaving the page: muted trailer (when the
// title is allowed for this viewer), match score with the reason behind it,
// three-level rating, cast and genres, and similar titles to hop between.

const Svg = ({ children, size = 22, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const CheckIcon = () => <Svg sw={2.3}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
const CloseIcon = () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>;
const ThumbUp = ({ fill }) => (
  <Svg sw={1.8}>
    <path d="M7 11v9H4v-9zM7 11l4-7c1.4 0 2.3 1.1 2 2.5L12.5 10H18a2 2 0 012 2.3l-1.2 6A2 2 0 0116.8 20H7" fill={fill ? "currentColor" : "none"} />
  </Svg>
);
const ThumbDown = ({ fill }) => (
  <Svg sw={1.8}>
    <path d="M17 13V4h3v9zM17 13l-4 7c-1.4 0-2.3-1.1-2-2.5l.5-3.5H6a2 2 0 01-2-2.3l1.2-6A2 2 0 017.2 4H17" fill={fill ? "currentColor" : "none"} />
  </Svg>
);
const Heart = ({ fill }) => (
  <Svg sw={1.8}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill={fill ? "currentColor" : "none"} />
  </Svg>
);
const SoundIcon = ({ on }) => (
  <Svg sw={1.8}>
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    {on ? <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
  </Svg>
);

/** Three-level rating control: not for me / like / love */
export function RateButtons({ item, compact = false }) {
  const t = useT();
  const [v, setV] = useState(() => getRating(item));
  useEffect(() => setV(getRating(item)), [item]);
  const set = (n) => setV(rateTitle(item, n));
  const opts = [
    { n: -1, label: t("rate.no"), Icon: ThumbDown },
    { n: 1, label: t("rate.like"), Icon: ThumbUp },
    { n: 2, label: t("rate.love"), Icon: Heart },
  ];
  return (
    <div className={`nx-rate${compact ? " nx-rate--compact" : ""}`} role="group" aria-label={t("rate.title")}>
      {opts.map(({ n, label, Icon }) => (
        <button
          key={n}
          className={`nx-rate__btn${v === n ? " on" : ""}${n === 2 ? " is-love" : ""}${n === -1 ? " is-no" : ""}`}
          onClick={() => set(n)}
          aria-pressed={v === n}
          aria-label={label}
          title={label}
        >
          <Icon fill={v === n} />
        </button>
      ))}
    </div>
  );
}

const fmtRuntime = (min, lang) => {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return lang === "vi" ? `${h ? `${h} giờ ` : ""}${m} phút` : `${h ? `${h}h ` : ""}${m}m`;
};

export default function NxPreview({
  item,
  meta = {},
  apiKey,
  aff,
  onClose,
  onPlay,
  onOpen,
  onPreview,
  isSaved,
  onToggleSave,
}) {
  const t = useT();
  const lang = useLang();
  const type = item.media_type === "tv" ? "tv" : "movie";
  const [d, setD] = useState(null);
  const [sound, setSound] = useState(false);
  // Trailer: "loading" (hidden behind the artwork) → "playing" (faded in),
  // "blocked" when the browser refused autoplay (shows a play button),
  // "failed" when YouTube can't play it (artwork stays)
  const [yt, setYt] = useState("loading");
  const [extraVideos, setExtraVideos] = useState(null);
  const frameRef = useRef(null);
  const [, force] = useState(0);
  const boxRef = useRef(null);

  // Details + videos + cast + similar in one request
  useEffect(() => {
    let off = false;
    setD(null);
    setSound(false);
    setYt("loading");
    setExtraVideos(null);
    const vl = lang === "vi" ? "vi,en,null" : "en,null";
    tmdbFetch(
      `/${type}/${item.id}?append_to_response=videos,credits,recommendations&include_video_language=${vl}`,
      apiKey,
      { priority: true },
    )
      .then((r) => !off && setD(r))
      .catch(() => !off && setD({}));
    boxRef.current?.scrollTo?.(0, 0);
    return () => {
      off = true;
    };
  }, [item.id, type, apiKey, lang]);

  // Close on Escape; keep focus inside
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    boxRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const full = { ...item, ...(d || {}), media_type: type };
  const title = full.title || full.name;
  const year = (full.release_date || full.first_air_date || "").slice(0, 4);
  const pickVideo = (list) => {
    const vids = (list || []).filter((v) => v.site === "YouTube" && v.key);
    const by = (type, official) =>
      vids.find((v) => v.type === type && (official == null || !!v.official === official));
    return (
      by("Trailer", true) || by("Trailer") || by("Teaser") || by("Clip") ||
      by("Featurette") || by("Opening Credits") || vids[0] || null
    );
  };
  const trailer = useMemo(
    () => pickVideo(d?.videos?.results) || pickVideo(extraVideos),
    [d, extraVideos],
  );

  // Nothing in the viewer's language: look in the title's own language
  useEffect(() => {
    if (!d || meta.restricted || pickVideo(d.videos?.results) || extraVideos) return;
    const orig = d.original_language;
    if (!orig) return;
    let off = false;
    tmdbFetch(`/${type}/${item.id}/videos?include_video_language=${orig},en,null`, apiKey, { priority: true })
      .then((r) => !off && setExtraVideos(r.results || []))
      .catch(() => !off && setExtraVideos([]));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, meta.restricted]);

  // Talk to the YouTube player (enablejsapi) to know when it really plays,
  // and to switch sound without reloading it
  const ytCommand = (func, args = []) =>
    frameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*",
    );
  const heard = useRef(false); // the player has answered our handshake
  const handshake = useRef(null);
  const blockTimer = useRef(null);
  useEffect(() => {
    if (!trailer || meta.restricted) return;
    setYt("loading");
    heard.current = false;
    const onMsg = (e) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      let m = e.data;
      try {
        m = typeof m === "string" ? JSON.parse(m) : m;
      } catch {
        return;
      }
      if (!m || typeof m !== "object") return;
      if (!heard.current) {
        heard.current = true;
        clearInterval(handshake.current);
        ytCommand("addEventListener", ["onStateChange"]);
        ytCommand("addEventListener", ["onError"]);
      }
      if (m.event === "onReady") {
        ytCommand("mute");
        ytCommand("playVideo");
      }
      const state = m.event === "onStateChange" ? m.info : m.info?.playerState;
      if (state === 1) setYt("playing");
      if (m.event === "onError") setYt("failed");
    };
    window.addEventListener("message", onMsg);
    // Tapping into the player moves focus into the iframe
    const onBlur = () =>
      setTimeout(() => {
        if (document.activeElement === frameRef.current)
          setYt((s) => (s === "blocked" ? "playing" : s));
      }, 0);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("blur", onBlur);
      clearTimeout(blockTimer.current);
      clearInterval(handshake.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailer, meta.restricted]);
  // Like YouTube's own API: keep saying hello until the player answers
  // (on phones it is often not ready when the frame's load event fires)
  const onFrameLoad = () => {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    clearInterval(handshake.current);
    let n = 0;
    const hello = () => {
      if (heard.current || ++n > 60) return clearInterval(handshake.current);
      w.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
    };
    hello();
    handshake.current = setInterval(hello, 250);
    // Still not playing a while after the player loaded: the browser refused
    // autoplay (e.g. iPhone Low Power Mode). Show the video so a tap plays it.
    clearTimeout(blockTimer.current);
    blockTimer.current = setTimeout(
      () => setYt((s) => (s === "loading" ? "blocked" : s)),
      7000,
    );
  };
  const toggleSound = () => {
    if (sound) ytCommand("mute");
    else {
      ytCommand("unMute");
      ytCommand("setVolume", [100]);
      ytCommand("playVideo");
    }
    setSound(!sound);
  };

  const match = matchScore(full, aff);
  const cast = (d?.credits?.cast || []).slice(0, 4).map((c) => c.name);
  const genres = (d?.genres || []).map((g) => g.name);
  const similar = (d?.recommendations?.results || [])
    .filter((r) => r.backdrop_path && !isDisliked({ ...r, media_type: type }))
    .slice(0, 9)
    .map((r) => ({ ...r, media_type: type }));
  const saved = isSaved?.(full);
  const length =
    type === "movie"
      ? fmtRuntime(full.runtime, lang)
      : full.number_of_seasons
        ? t("preview.seasons", { n: full.number_of_seasons })
        : null;

  const ytSrc =
    trailer && !meta.restricted && yt !== "failed"
      ? `https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailer.key}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
      : null;

  return (
    <div className="nx-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nx-preview" ref={boxRef} tabIndex={-1}>
        <button className="nx-preview__close" onClick={onClose} aria-label={t("preview.close")}>
          <CloseIcon />
        </button>

        <div className="nx-preview__media">
          {full.backdrop_path || full.poster_path ? (
            <img src={imgUrl(full.backdrop_path || full.poster_path, "w1280")} alt="" />
          ) : null}
          {ytSrc && (
            <iframe
              ref={frameRef}
              key={trailer.key}
              src={ytSrc}
              title={`${title} trailer`}
              className={`nx-preview__trailer is-${yt}`}
              allow="autoplay; encrypted-media"
              tabIndex={-1}
              onLoad={onFrameLoad}
            />
          )}
          {ytSrc && yt === "blocked" && (
            <span className="nx-preview__tplay" aria-hidden="true">
              <PlayIcon />
              <span>{t("preview.tapTrailer")}</span>
            </span>
          )}
          <div className="nx-preview__fade" aria-hidden="true" />
          <div className="nx-preview__head">
            <h2 className="nx-preview__title">{title}</h2>
            <div className="nx-preview__actions">
              <button
                className="nx-btn nx-btn--play"
                onClick={() => onPlay(full)}
                disabled={meta.restricted}
                title={meta.restricted ? t("preview.restricted") : undefined}
              >
                <PlayIcon /> {meta.restricted ? t("preview.locked") : t("hero.play")}
              </button>
              {onToggleSave && (
                <button
                  className={`nx-round${saved ? " on" : ""}`}
                  onClick={() => {
                    onToggleSave(full);
                    force((n) => n + 1);
                  }}
                  aria-pressed={!!saved}
                  aria-label={t(saved ? "hero.remove" : "hero.add", { title })}
                  title={t("hero.myList")}
                >
                  {saved ? <CheckIcon /> : <PlusIcon />}
                </button>
              )}
              <RateButtons item={full} />
              {ytSrc && yt === "playing" && (
                <button
                  className="nx-round nx-preview__sound"
                  onClick={toggleSound}
                  aria-label={sound ? t("preview.mute") : t("preview.unmute")}
                  title={sound ? t("preview.mute") : t("preview.unmute")}
                >
                  <SoundIcon on={sound} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="nx-preview__body">
          <div className="nx-preview__main">
            <p className="nx-preview__facts">
              {match && <b className="nx-match">{t("preview.match", { n: match.score })}</b>}
              {year && <span>{year}</span>}
              {meta.cert && <span className="nx-preview__cert">{meta.cert}</span>}
              {length && <span>{length}</span>}
              {full.vote_average > 0 && <span>★ {full.vote_average.toFixed(1)}</span>}
            </p>
            {match?.because && (
              <p className="nx-preview__why">{t("preview.because", { title: match.because })}</p>
            )}
            {full.overview ? (
              <p className="nx-preview__overview">{full.overview}</p>
            ) : d ? (
              <p className="nx-preview__overview is-muted">{t("preview.noOverview")}</p>
            ) : (
              <p className="nx-preview__overview is-loading" aria-hidden="true" />
            )}
          </div>
          <div className="nx-preview__side">
            {cast.length > 0 && (
              <p>
                <span>{t("preview.cast")}:</span> {cast.join(", ")}
              </p>
            )}
            {genres.length > 0 && (
              <p>
                <span>{t("preview.genres")}:</span> {genres.join(", ")}
              </p>
            )}
            <button className="nx-preview__more" onClick={() => onOpen(full)}>
              {type === "tv" ? t("preview.episodes") : t("preview.details")} →
            </button>
          </div>
        </div>

        {similar.length > 0 && (
          <div className="nx-preview__similar">
            <h3>{t("preview.similar")}</h3>
            <div className="nx-sim-grid">
              {similar.map((s) => {
                const m = matchScore(s, aff);
                return (
                  <button key={s.id} className="nx-sim" onClick={() => onPreview(s)}>
                    <span className="nx-sim__art">
                      <img src={imgUrl(s.backdrop_path, "w500")} alt="" loading="lazy" />
                      <span className="nx-sim__name">{s.title || s.name}</span>
                    </span>
                    <span className="nx-sim__facts">
                      {m && <b className="nx-match">{t("preview.match", { n: m.score })}</b>}
                      <span>{(s.release_date || s.first_air_date || "").slice(0, 4)}</span>
                    </span>
                    {s.overview && <span className="nx-sim__text">{s.overview}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
