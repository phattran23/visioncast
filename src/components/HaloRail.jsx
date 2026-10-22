import { useRef, useState, useEffect, useCallback } from "react";
import { imgUrl } from "../utils/api";
import { ChevronLeftIcon, ChevronRightIcon, FilmIcon } from "./Icons";

// Halo horizontal rail: a titled, snap-scrolling row. On pointer devices glass
// arrow buttons page through it; on touch it is a plain swipeable row.

export function HaloRail({ title, children, variant = "tall" }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });

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
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className={`halo-section halo-section--${variant}`}>
      <div className="halo-section__head">
        <h2 className="halo-section__title">{title}</h2>
        <div className="halo-section__arrows">
          <button
            className="halo-icon-btn glass"
            onClick={() => page(-1)}
            disabled={edges.start}
            aria-label={`Scroll ${title} back`}
          >
            <ChevronLeftIcon size={20} />
          </button>
          <button
            className="halo-icon-btn glass"
            onClick={() => page(1)}
            disabled={edges.end}
            aria-label={`Scroll ${title} forward`}
          >
            <ChevronRightIcon size={20} />
          </button>
        </div>
      </div>
      <div className="halo-rail" ref={ref}>
        {children}
      </div>
    </section>
  );
}

// 16:10 landscape card used for "Up next" (continue watching)
export function HaloWideCard({ item, progress = 0, onClick }) {
  const title = item.title || item.name;
  const isTV = item.media_type === "tv";
  const art = item.backdrop_path || item.poster_path;
  const meta =
    isTV && item.season != null && item.episode != null
      ? `S${item.season} · E${item.episode}${item.episodeName ? ` · ${item.episodeName}` : ""}`
      : isTV
        ? "Series"
        : "Movie";
  return (
    <button className="halo-wide" onClick={onClick}>
      <span className={`halo-wide__frame${item.backdrop_path ? "" : " is-poster"}`}>
        {art ? (
          <img src={imgUrl(art, "w780")} alt="" loading="lazy" />
        ) : (
          <span className="halo-wide__empty">
            <FilmIcon />
          </span>
        )}
        {progress > 0 && (
          <span className="halo-wide__bar" aria-hidden="true">
            <span style={{ width: `${Math.min(progress, 100)}%` }} />
          </span>
        )}
      </span>
      <span className="halo-wide__title">{title}</span>
      <span className="halo-wide__meta">
        {progress > 0 ? `Continue · ${Math.round(progress)}% · ` : ""}
        {meta}
      </span>
    </button>
  );
}
