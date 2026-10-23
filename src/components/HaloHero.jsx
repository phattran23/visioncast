import { useState, useEffect, useRef, useCallback } from "react";
import { imgUrl } from "../utils/api";
import { PlayIcon, StarIcon } from "./Icons";
import { useT } from "../utils/i18n";

// Halo hero: a rounded card that cross-fades between a handful of titles, with
// a blurred copy of the current artwork glowing behind the page ("ambient").
// Phones get the portrait poster, wider screens the landscape backdrop.

const INTERVAL = 11000; // time each featured title stays on screen

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export default function HaloHero({ items, onSelect, isSaved, onToggleSave }) {
  const t = useT();
  const slides = items.filter((i) => i.backdrop_path || i.poster_path);
  const count = slides.length;
  const [active, setActive] = useState(0);
  const timer = useRef(null);
  const touchX = useRef(null);

  const restart = useCallback(() => {
    clearInterval(timer.current);
    if (count > 1)
      timer.current = setInterval(
        () => setActive((a) => (a + 1) % count),
        INTERVAL,
      );
  }, [count]);

  useEffect(() => {
    restart();
    return () => clearInterval(timer.current);
  }, [restart]);

  const go = (i) => {
    setActive(((i % count) + count) % count);
    restart();
  };

  if (count === 0) return null;

  return (
    <section className="halo-hero-wrap" aria-roledescription="carousel" aria-label="Featured">
      <div className="halo-ambient" aria-hidden="true">
        {slides.map((s, n) => (
          <img
            key={`${s.media_type}_${s.id}`}
            src={imgUrl(s.backdrop_path || s.poster_path, "w780")}
            alt=""
            className={n === active ? "is-active" : ""}
          />
        ))}
      </div>

      <div
        className="halo-hero"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
        }}
      >
        {slides.map((s, n) => (
          <picture
            key={`${s.media_type}_${s.id}`}
            className={`halo-hero__art${n === active ? " is-active" : ""}`}
            aria-hidden="true"
          >
            {s.poster_path && (
              <source
                media="(max-width: 700px)"
                srcSet={imgUrl(s.poster_path, "w780")}
              />
            )}
            <img
              src={imgUrl(s.backdrop_path || s.poster_path, "w1280")}
              alt=""
              loading={n === 0 ? "eager" : "lazy"}
            />
          </picture>
        ))}
        <div className="halo-hero__shade" aria-hidden="true" />

        {slides.map((s, n) => {
          const title = s.title || s.name;
          const year = (s.release_date || s.first_air_date || "").slice(0, 4);
          const saved = isSaved?.(s);
          const on = n === active;
          return (
            <div
              key={`${s.media_type}_${s.id}`}
              className={`halo-hero__text${on ? " is-active" : ""}`}
              aria-hidden={!on}
            >
              <span className="halo-chip glass">
                {s._forYou ? t("hero.forYou") : t("hero.trending")} · {s.media_type === "tv" ? t("media.series") : t("media.movie")}
              </span>
              <h1 className="halo-hero__title">{title}</h1>
              {s.overview && <p className="halo-hero__line">{s.overview}</p>}
              <div className="halo-hero__actions">
                <button
                  className="halo-btn-play"
                  onClick={() => onSelect(s)}
                  tabIndex={on ? 0 : -1}
                >
                  <PlayIcon /> {t("hero.play")}
                </button>
                {onToggleSave && (
                  <button
                    className="halo-icon-btn halo-icon-btn--lg glass"
                    onClick={() => onToggleSave(s)}
                    aria-label={t(saved ? "hero.remove" : "hero.add", { title })}
                    aria-pressed={!!saved}
                    tabIndex={on ? 0 : -1}
                  >
                    {saved ? <CheckIcon /> : <PlusIcon />}
                  </button>
                )}
                <span className="halo-hero__meta">
                  {s.vote_average > 0 && (
                    <>
                      <StarIcon /> {s.vote_average.toFixed(1)}
                    </>
                  )}
                  {year && <span>{year}</span>}
                </span>
              </div>
            </div>
          );
        })}

        {count > 1 && (
          <div className="halo-dots">
            {slides.map((s, n) => (
              <button
                key={`${s.media_type}_${s.id}`}
                className="halo-dot-btn"
                onClick={() => go(n)}
                aria-label={`Show ${s.title || s.name}`}
                aria-current={n === active}
              >
                <span className={`halo-dot${n === active ? " is-active" : ""}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
