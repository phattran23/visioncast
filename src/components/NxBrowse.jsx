import { useState, useEffect, useRef, useCallback } from "react";
import { imgUrl } from "../utils/api";
import { PlayIcon, ChevronLeftIcon, ChevronRightIcon, FilmIcon, VisionCastMark } from "./Icons";
import { useT } from "../utils/i18n";

// Streaming-style home building blocks: a full-bleed billboard, rows that
// page sideways, landscape title cards and numbered "Top 10" cards.
// Hit areas never grow or move on hover (see focus.css): only the artwork
// brightens, so a click always lands on the title under the pointer.

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

// ── Billboard ───────────────────────────────────────────────────────────────
export function NxHero({ items, onSelect, onPlay, isSaved, onToggleSave, ratingFor, matchFor }) {
  const t = useT();
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
      {/* Phones: the poster's colours tint the page behind the card */}
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
          <picture key={`${s.media_type}_${s.id}`} className={`nx-hero__art${n === active ? " is-active" : ""}`} aria-hidden="true">
            {s.poster_path && <source media="(max-width: 700px)" srcSet={imgUrl(s.poster_path, "w780")} />}
            <img src={imgUrl(s.backdrop_path || s.poster_path, "original")} alt="" loading={n === 0 ? "eager" : "lazy"} />
          </picture>
        ))}
        <div className="nx-hero__shade" aria-hidden="true" />

        {slides.map((s, n) => {
          const on = n === active;
          const title = s.title || s.name;
          const saved = isSaved?.(s);
          const y = year(s);
          return (
            <div key={`${s.media_type}_${s.id}`} className={`nx-hero__info${on ? " is-active" : ""}`} aria-hidden={!on}>
              <span className="nx-hero__kicker">
                <span className="nx-hero__kmark"><VisionCastMark /></span>
                {s.media_type === "tv" ? t("media.series") : t("media.movie")}
                {s._forYou && <em>{t("hero.forYou")}</em>}
              </span>
              <h1 className="nx-hero__title">{title}</h1>
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
                    {saved ? <CheckIcon /> : <PlusIcon />} {t("hero.myList")}
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

// ── Title card: landscape on wide screens, poster on phones ────────────────
// wide: always landscape (continue watching)
export function NxCard({ item, onClick, cert, restricted, progress = 0, meta, wide = false }) {
  const t = useT();
  const title = item.title || item.name;
  const land = item.backdrop_path;
  const poster = item.poster_path;
  return (
    <button className={`nx-card${wide ? " nx-card--wide" : ""}${land ? "" : " no-land"}`} onClick={onClick} title={title}>
      <span className="nx-card__frame">
        {land || poster ? (
          <picture>
            {!wide && poster && <source media="(max-width: 700px)" srcSet={imgUrl(poster, "w342")} />}
            <img src={imgUrl(land || poster, "w780")} alt="" loading="lazy" />
          </picture>
        ) : (
          <span className="nx-card__empty"><FilmIcon /></span>
        )}
        <span className="nx-card__name">{title}</span>
        {cert && <span className={`nx-card__cert${restricted ? " is-restricted" : ""}`}>{cert}</span>}
        {progress > 0 && (
          <span className="nx-card__bar" aria-hidden="true">
            <span style={{ width: `${Math.min(progress, 100)}%` }} />
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

// ── Top 10: big rank number beside a poster ─────────────────────────────────
export function NxTopCard({ item, rank, onClick }) {
  const title = item.title || item.name;
  return (
    <button className="nx-top" onClick={onClick} title={title} aria-label={`${rank}. ${title}`}>
      <span className="nx-top__num" aria-hidden="true">{rank}</span>
      <span className="nx-top__poster">
        {item.poster_path ? <img src={imgUrl(item.poster_path, "w342")} alt="" loading="lazy" /> : <FilmIcon />}
      </span>
    </button>
  );
}
