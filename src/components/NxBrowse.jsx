import { useState, useEffect, useRef, useCallback } from "react";
import { imgUrl, posterSrcSet, backdropSrcSet, tmdbFetch } from "../utils/api";
import { PlayIcon, ChevronLeftIcon, ChevronRightIcon, FilmIcon, VisionCastMark } from "./Icons";
import { useT, useLang } from "../utils/i18n";

// Streaming-style home building blocks: a full-bleed billboard, rows that
// page sideways, landscape title cards, numbered "Top 10" cards and large
// featured cards. Hit areas never grow or move on hover (see focus.css): only
// the artwork brightens, so a click always lands on the title under the pointer.
// Phones get their own look for these (apple.css).

const INTERVAL = 11000;

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </svg>
);

const year = (i) => (i.release_date || i.first_air_date || "").slice(0, 4);

// TMDB genre names (films + series)
const GENRES = {
  28: ["Hành động", "Action"], 12: ["Phiêu lưu", "Adventure"], 16: ["Hoạt hình", "Animation"],
  35: ["Hài", "Comedy"], 80: ["Hình sự", "Crime"], 99: ["Tài liệu", "Documentary"],
  18: ["Chính kịch", "Drama"], 10751: ["Gia đình", "Family"], 14: ["Giả tưởng", "Fantasy"],
  36: ["Lịch sử", "History"], 27: ["Kinh dị", "Horror"], 10402: ["Âm nhạc", "Music"],
  9648: ["Bí ẩn", "Mystery"], 10749: ["Lãng mạn", "Romance"], 878: ["Viễn tưởng", "Sci-Fi"],
  10770: ["Phim truyền hình", "TV Movie"], 53: ["Gây cấn", "Thriller"], 10752: ["Chiến tranh", "War"],
  37: ["Miền Tây", "Western"], 10759: ["Hành động", "Action"], 10762: ["Thiếu nhi", "Kids"],
  10763: ["Tin tức", "News"], 10764: ["Thực tế", "Reality"], 10765: ["Viễn tưởng", "Sci-Fi"],
  10766: ["Phim dài tập", "Soap"], 10767: ["Talk show", "Talk"], 10768: ["Chính trị", "Politics"],
};
export const genreNames = (item, lang, max = 2) =>
  (item.genre_ids || (item.genres || []).map((g) => g.id))
    .map((id) => GENRES[id]?.[lang === "vi" ? 0 : 1])
    .filter(Boolean)
    .filter((g, i, a) => a.indexOf(g) === i)
    .slice(0, max);

// Title logo + a poster without text, from TMDB's image lists (cached)
const artCache = new Map();
export function useTitleArt(item, apiKey) {
  const lang = useLang();
  const type = item?.media_type === "tv" ? "tv" : "movie";
  const key = item ? `${type}_${item.id}_${lang}` : null;
  const [art, setArt] = useState(() => (key && artCache.get(key)) || null);
  useEffect(() => {
    if (!key) return;
    if (artCache.has(key)) {
      setArt(artCache.get(key));
      return;
    }
    let off = false;
    tmdbFetch(`/${type}/${item.id}/images?include_image_language=${lang},en,null`, apiKey)
      .then((d) => {
        const rankLang = (x) => (x.iso_639_1 === lang ? 0 : x.iso_639_1 === "en" ? 1 : x.iso_639_1 == null ? 2 : 3);
        const logo = [...(d.logos || [])].sort((a, b) => rankLang(a) - rankLang(b) || (b.vote_average || 0) - (a.vote_average || 0))[0];
        const textless = (d.posters || []).find((p) => p.iso_639_1 == null || p.iso_639_1 === "xx");
        const value = { logo: logo?.file_path || null, textless: textless?.file_path || null };
        artCache.set(key, value);
        if (!off) setArt(value);
      })
      .catch(() => {
        artCache.set(key, { logo: null, textless: null });
      });
    return () => {
      off = true;
    };
  }, [key, type, item?.id, lang, apiKey]);
  return art || { logo: null, textless: null };
}

function HeroArt({ s, active, first, apiKey }) {
  const art = useTitleArt(s, apiKey);
  // Phones: a poster without text (or the backdrop); wide screens: backdrop
  const phone = art.textless || s.backdrop_path || s.poster_path;
  const phoneSet = art.textless ? posterSrcSet(art.textless) : s.backdrop_path ? backdropSrcSet(s.backdrop_path) : posterSrcSet(s.poster_path);
  return (
    <picture className={`nx-hero__art${active ? " is-active" : ""}${art.textless ? " is-portrait" : ""}`} aria-hidden="true">
      {phone && <source media="(max-width: 700px)" srcSet={phoneSet} sizes="100vw" />}
      <img src={imgUrl(s.backdrop_path || s.poster_path, "original")} alt="" loading={first ? "eager" : "lazy"} />
    </picture>
  );
}

function TitleMark({ item, apiKey, className }) {
  const art = useTitleArt(item, apiKey);
  const title = item.title || item.name;
  return art.logo ? <img className={className} src={imgUrl(art.logo, "w500")} alt={title} /> : <>{title}</>;
}

// ── Billboard ───────────────────────────────────────────────────────────────
export function NxHero({ items, apiKey, onSelect, onPlay, isSaved, onToggleSave, ratingFor, matchFor }) {
  const t = useT();
  const lang = useLang();
  const slides = items.filter((i) => i.backdrop_path || i.poster_path);
  const count = slides.length;
  const [active, setActive] = useState(0);
  const timer = useRef(null);
  const hold = useRef(false);
  const touchX = useRef(null);

  const restart = useCallback(() => {
    clearInterval(timer.current);
    if (count > 1 && !hold.current)
      timer.current = setInterval(() => setActive((a) => (a + 1) % count), INTERVAL);
  }, [count]);
  useEffect(() => {
    restart();
    return () => clearInterval(timer.current);
  }, [restart]);
  const go = (i) => {
    setActive(((i % count) + count) % count);
    restart();
  };
  const pause = () => {
    hold.current = true;
    clearInterval(timer.current);
  };
  const resume = () => {
    hold.current = false;
    restart();
  };

  if (count === 0) return null;
  const cur = slides[Math.min(active, count - 1)];
  const cert = ratingFor?.(cur);

  return (
    <section className="nx-hero" aria-roledescription="carousel" aria-label="Featured">
      <div className="nx-hero__tint" aria-hidden="true">
        <img src={imgUrl(cur.poster_path || cur.backdrop_path, "w342")} alt="" />
      </div>

      <div
        className="nx-hero__stage"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && resume()}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
        }}
      >
        {slides.map((s, n) => (
          <HeroArt key={`${s.media_type}_${s.id}`} s={s} active={n === active} first={n === 0} apiKey={apiKey} />
        ))}
        <div className="nx-hero__shade" aria-hidden="true" />

        {slides.map((s, n) => {
          const on = n === active;
          const title = s.title || s.name;
          const saved = isSaved?.(s);
          const y = year(s);
          const c = ratingFor?.(s);
          return (
            <div key={`${s.media_type}_${s.id}`} className={`nx-hero__info${on ? " is-active" : ""}`} aria-hidden={!on}>
              <span className="nx-hero__kicker">
                <span className="nx-hero__kmark"><VisionCastMark /></span>
                {s.media_type === "tv" ? t("media.series") : t("media.movie")}
                {s._forYou && <em>{t("hero.forYou")}</em>}
              </span>
              <span className="nx-hero__chip">{s._forYou ? t("hero.forYou") : t("hero.trending")}</span>
              <h1 className="nx-hero__title">
                <TitleMark item={s} apiKey={apiKey} className="nx-hero__logo" />
              </h1>
              <p className="nx-hero__genres">
                <span>{[s.media_type === "tv" ? t("media.series") : t("media.movie"), ...genreNames(s, lang)].join(" · ")}</span>
                {c && <span className="nx-hero__certbox">{c}</span>}
              </p>
              <p className="nx-hero__facts">
                {(() => {
                  const m = matchFor?.(s);
                  return m ? <b className="nx-match">{t("preview.match", { n: m.score })}</b> : null;
                })()}
                {s.vote_average > 0 && <b>★ {s.vote_average.toFixed(1)}</b>}
                {y && <span>{y}</span>}
              </p>
              {s.overview && <p className="nx-hero__overview">{s.overview}</p>}
              <div className="nx-hero__actions">
                <button className="nx-btn nx-btn--play" onClick={() => (onPlay || onSelect)(s)} tabIndex={on ? 0 : -1}>
                  <PlayIcon /> {t("hero.play")}
                </button>
                <button className="nx-btn nx-btn--info" onClick={() => onSelect(s)} tabIndex={on ? 0 : -1}>
                  <InfoIcon /> {t("hero.moreInfo")}
                </button>
                {onToggleSave && (
                  <button
                    className="nx-btn nx-btn--list"
                    onClick={() => onToggleSave(s)}
                    aria-label={t(saved ? "hero.remove" : "hero.add", { title })}
                    aria-pressed={!!saved}
                    tabIndex={on ? 0 : -1}
                  >
                    {saved ? <CheckIcon /> : <PlusIcon />} <span className="nx-btn__label">{t("hero.myList")}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="nx-hero__side">
          {count > 1 && (
            <div className="nx-hero__dots">
              {slides.map((s, n) => (
                <button
                  key={`${s.media_type}_${s.id}`}
                  className={`nx-hero__dot${n === active ? " is-active" : ""}`}
                  onClick={() => go(n)}
                  aria-label={s.title || s.name}
                  aria-current={n === active}
                />
              ))}
            </div>
          )}
          {cert && <span className="nx-hero__cert">{cert}</span>}
        </div>
      </div>
    </section>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────
export function NxRow({ title, children, variant = "card" }) {
  const t = useT();
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update, children]);

  const page = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * (el.clientWidth - 120), behavior: "smooth" });
  };

  return (
    <section className={`nx-row nx-row--${variant}`}>
      <h2 className="nx-row__title">{title}</h2>
      <div className="nx-row__slider">
        <button className="nx-row__arrow nx-row__arrow--prev" onClick={() => page(-1)} hidden={edges.start} aria-label={t("rail.back", { title })}>
          <ChevronLeftIcon size={30} />
        </button>
        <div className="nx-row__track" ref={ref}>
          {children}
        </div>
        <button className="nx-row__arrow nx-row__arrow--next" onClick={() => page(1)} hidden={edges.end} aria-label={t("rail.forward", { title })}>
          <ChevronRightIcon size={30} />
        </button>
      </div>
    </section>
  );
}

const releaseLabel = (item, t, lang) => {
  const raw = item.release_date || item.first_air_date;
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!(d > today)) return null;
  const date = lang === "vi" ? `${d.getDate()} Th${d.getMonth() + 1}` : d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  return t("new.releases", { date });
};

// ── Title card: landscape on wide screens, poster on phones ────────────────
// wide: always landscape (continue watching); `left` = time left / episode
export function NxCard({ item, onClick, cert, restricted, progress = 0, meta, wide = false, left }) {
  const t = useT();
  const lang = useLang();
  const title = item.title || item.name;
  const land = item.backdrop_path;
  const poster = item.poster_path;
  const soon = !wide && releaseLabel(item, t, lang);
  return (
    <button className={`nx-card${wide ? " nx-card--wide" : ""}${land ? "" : " no-land"}`} onClick={onClick} title={title}>
      <span className="nx-card__frame">
        {land || poster ? (
          <picture>
            {!wide && poster && <source media="(max-width: 700px)" srcSet={posterSrcSet(poster)} sizes="31vw" />}
            <img
              src={imgUrl(land || poster, "w780")}
              srcSet={land ? backdropSrcSet(land) : posterSrcSet(poster)}
              sizes={wide ? "(max-width: 700px) 85vw, 26vw" : "(max-width: 1100px) 25vw, 17vw"}
              alt=""
              loading="lazy"
            />
          </picture>
        ) : (
          <span className="nx-card__empty"><FilmIcon /></span>
        )}
        <span className="nx-card__name">{title}</span>
        {cert && <span className={`nx-card__cert${restricted ? " is-restricted" : ""}`}>{cert}</span>}
        {soon && <span className="nx-card__soon">{soon}</span>}
        {progress > 0 && (
          <span className="nx-card__bar" aria-hidden="true">
            <span style={{ width: `${Math.min(progress, 100)}%` }} />
          </span>
        )}
        {wide && (
          <span className="nx-card__dock" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
            <span className="nx-card__dockbar"><span style={{ width: `${Math.min(Math.max(progress, 3), 100)}%` }} /></span>
            <span className="nx-card__docktext">{left || meta || `${Math.round(progress)}%`}</span>
          </span>
        )}
      </span>
      {(wide || meta) && (
        <span className="nx-card__meta">
          {wide && <b>{title}</b>}
          <span>
            {progress > 0 ? `${t("media.continue")} · ${Math.round(progress)}%` : ""}
            {progress > 0 && meta ? " · " : ""}
            {meta}
          </span>
        </span>
      )}
    </button>
  );
}

// ── Top 10: big rank number beside a poster (inside it on phones) ──────────
export function NxTopCard({ item, rank, onClick }) {
  const lang = useLang();
  const title = item.title || item.name;
  const genre = genreNames(item, lang, 1)[0];
  return (
    <button className="nx-top" onClick={onClick} title={title} aria-label={`${rank}. ${title}`}>
      <span className="nx-top__num" aria-hidden="true">{rank}</span>
      <span className="nx-top__poster">
        {item.poster_path ? (
          <img src={imgUrl(item.poster_path, "w500")} srcSet={posterSrcSet(item.poster_path)} sizes="(max-width: 700px) 42vw, 13vw" alt="" loading="lazy" />
        ) : (
          <FilmIcon />
        )}
        <span className="nx-top__rank" aria-hidden="true">{rank}</span>
        {genre && <span className="nx-top__genre">{genre}</span>}
      </span>
    </button>
  );
}

// ── Featured: large cards with artwork, title logo and a short line ────────
function FeatureCard({ item, apiKey, onSelect }) {
  const t = useT();
  const lang = useLang();
  const art = useTitleArt(item, apiKey);
  const pic = art.textless || item.poster_path;
  const line = (item.overview || "").split(/(?<=[.!?])\s/)[0];
  return (
    <button className="nx-feature__card" onClick={() => onSelect(item)} aria-label={item.title || item.name}>
      {art.textless || !item.backdrop_path ? (
        <img src={imgUrl(pic, "w780")} srcSet={posterSrcSet(pic)} sizes="90vw" alt="" loading="lazy" />
      ) : (
        <img src={imgUrl(item.backdrop_path, "w1280")} srcSet={backdropSrcSet(item.backdrop_path)} sizes="90vw" alt="" loading="lazy" />
      )}
      <span className="nx-feature__shade" aria-hidden="true" />
      <span className="nx-feature__info">
        <span className="nx-feature__title">
          <TitleMark item={item} apiKey={apiKey} className="nx-feature__logo" />
        </span>
        <span className="nx-feature__meta">
          {[item.media_type === "tv" ? t("media.series") : t("media.movie"), ...genreNames(item, lang, 1)].join(" · ")}
        </span>
        {line && <span className="nx-feature__line">{line}</span>}
      </span>
    </button>
  );
}

export function NxFeatureRow({ title, items, apiKey, onSelect }) {
  if (!items?.length) return null;
  return (
    <section className="nx-feature">
      <h2 className="nx-row__title">{title}</h2>
      <div className="nx-feature__track">
        {items.map((i) => (
          <FeatureCard key={`${i.media_type}_${i.id}`} item={i} apiKey={apiKey} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
