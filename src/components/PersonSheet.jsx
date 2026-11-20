import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { imgUrl, posterSrcSet, tmdbFetch } from "../utils/api";
import { useT, useLang } from "../utils/i18n";
import { isDisliked } from "../utils/taste";

// A person's page: photo, name, role, birth date / place, short biography
// and the titles they appear in (most popular first), filterable by films /
// series. Opened from the cast lists (window event "visioncast:person").

const FILTERS = ["all", "movie", "tv"];

export default function PersonSheet({ person, apiKey, onClose, onPick }) {
  const t = useT();
  const lang = useLang();
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState("all");
  const [more, setMore] = useState(false);
  const [clamped, setClamped] = useState(false);
  const bioRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    let off = false;
    setD(null);
    setFilter("all");
    setMore(false);
    tmdbFetch(`/person/${person.id}?append_to_response=combined_credits`, apiKey, { priority: true })
      .then(async (r) => {
        // No biography in this language: take the English one
        if (!r.biography && lang !== "en") {
          try {
            const en = await tmdbFetch(`/person/${person.id}?language=en-US`, apiKey);
            if (en?.biography) r = { ...r, biography: en.biography };
          } catch {}
        }
        if (!off) setD(r);
      })
      .catch(() => !off && setD({}));
    boxRef.current?.scrollTo?.(0, 0);
    return () => {
      off = true;
    };
  }, [person.id, apiKey, lang]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = bioRef.current;
    if (!el || more) return;
    setClamped(el.scrollHeight > el.clientHeight + 2);
  }, [d?.biography, more]);

  // Titles, most popular first, one entry per title (roles merged)
  const titles = useMemo(() => {
    const list = [...(d?.combined_credits?.cast || []), ...(d?.known_for_department === "Acting" ? [] : d?.combined_credits?.crew || [])]
      .filter((x) => (x.media_type === "movie" || x.media_type === "tv") && x.poster_path)
      .filter((x) => !isDisliked(x));
    const byKey = new Map();
    for (const x of list) {
      const k = `${x.media_type}_${x.id}`;
      const role = x.character || x.job || "";
      const prev = byKey.get(k);
      if (prev) {
        if (role && !prev._roles.includes(role)) prev._roles.push(role);
      } else byKey.set(k, { ...x, _roles: role ? [role] : [] });
    }
    return [...byKey.values()].sort((a, b) => (b.popularity || 0) * Math.log10((b.vote_count || 0) + 10) - (a.popularity || 0) * Math.log10((a.vote_count || 0) + 10));
  }, [d]);
  const shown = filter === "all" ? titles : titles.filter((x) => x.media_type === filter);

  const born = d?.birthday
    ? new Date(`${d.birthday}T00:00:00`).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const dept = d?.known_for_department
    ? t(`person.dept.${d.known_for_department}`) !== `person.dept.${d.known_for_department}`
      ? t(`person.dept.${d.known_for_department}`)
      : d.known_for_department
    : null;

  return (
    <div className="vc-person" role="dialog" aria-modal="true" aria-label={person.name} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vc-person__panel" ref={boxRef}>
        <button className="vc-person__close" onClick={onClose} aria-label={t("preview.close")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>

        <header className="vc-person__head">
          {(d?.profile_path || person.profile_path) ? (
            <img className="vc-person__photo" src={imgUrl(d?.profile_path || person.profile_path, "h632")} alt="" />
          ) : (
            <span className="vc-person__photo vc-person__photo--empty">{person.name?.charAt(0)}</span>
          )}
          <h1 className="vc-person__name">{d?.name || person.name}</h1>
          <p className="vc-person__facts">
            {[dept, born && t("person.born", { date: born }), d?.place_of_birth].filter(Boolean).join(" · ")}
          </p>
        </header>

        {d?.biography && (
          <div className="vc-person__bio-wrap">
            <p ref={bioRef} className={`vc-person__bio${more ? " is-open" : ""}`}>{d.biography}</p>
            {(clamped || more) && (
              <button className="vc-person__more" onClick={() => setMore((m) => !m)}>{more ? t("watch.less") : t("at.more")}</button>
            )}
          </div>
        )}

        <div className="vc-person__bar">
          <h2>{t("person.titles", { n: titles.length || "" }).trim()}</h2>
          <div className="vc-person__chips" role="tablist">
            {FILTERS.map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={`vc-person__chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
                {t(`search.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="vc-person__grid">
          {d === null
            ? Array.from({ length: 9 }, (_, i) => <span key={i} className="vc-person__tile is-loading" />)
            : shown.map((x) => (
                <button key={`${x.media_type}_${x.id}`} className="vc-person__tile" onClick={() => onPick(x)} title={x.title || x.name}>
                  <span className="vc-person__poster">
                    <img src={imgUrl(x.poster_path, "w500")} srcSet={posterSrcSet(x.poster_path)} sizes="(max-width: 760px) 31vw, 150px" alt="" loading="lazy" />
                  </span>
                  <span className="vc-person__ttl">{x.title || x.name}</span>
                  {x._roles.length > 0 && <span className="vc-person__role">{x._roles.slice(0, 2).join(", ")}</span>}
                </button>
              ))}
          {d !== null && shown.length === 0 && <p className="vc-person__empty">{t("new.empty")}</p>}
        </div>
      </div>
    </div>
  );
}
