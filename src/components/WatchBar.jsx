import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PLAYER_SOURCES } from "../utils/api";
import { useT } from "../utils/i18n";

// Phone "watching" panel, right under the (sticky) player: what's playing,
// a one-tap next episode, compact actions and the source picker. Wide screens
// keep the regular detail layout (see watch.css).

const I = {
  next: <path d="M6 5l9 7-9 7zM17 5v14" />,
  save: <path d="M6 4h12v16l-6-4-6 4z" />,
  share: (
    <>
      <path d="M12 4v11M7.5 8.5L12 4l4.5 4.5" />
      <path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  source: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2.5" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
};
const Svg = ({ id, fill = false, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {I[id]}
  </svg>
);

export default function WatchBar({
  title,
  line, // e.g. "Mùa 1 · Tập 3 · The Pilot"
  meta, // e.g. "★ 7.5 · 2020 · 45 phút"
  overview,
  nextLabel, // e.g. "Tập 4"; omitted when there's no next episode
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
  const [more, setMore] = useState(false);
  const [sheet, setSheet] = useState(false);
  // "More" only when the synopsis is actually longer than two lines
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
  const source = PLAYER_SOURCES.find((s) => s.id === sourceId);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e) => e.key === "Escape" && setSheet(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  return (
    <section className="vc-watchbar" aria-label={title}>
      <h1 className="vc-watchbar__title">{title}</h1>
      {line && <p className="vc-watchbar__line">{line}</p>}
      {meta && <p className="vc-watchbar__meta">{meta}</p>}

      {nextLabel && onNext && (
        <button className="vc-watchbar__next" onClick={onNext}>
          <Svg id="next" fill size={20} />
          {t("watch.next", { ep: nextLabel })}
        </button>
      )}

      <div className="vc-watchbar__actions">
        {onSave && (
          <button className={`vc-watchbar__act${saved ? " on" : ""}`} onClick={onSave} aria-pressed={!!saved}>
            <Svg id="save" fill={saved} />
            <span>{saved ? t("detail.saved") : t("detail.save")}</span>
          </button>
        )}
        {onShare && (
          <button className="vc-watchbar__act" onClick={onShare}>
            <Svg id="share" />
            <span>{t("share.button")}</span>
          </button>
        )}
        {onToggleWatched && (
          <button className={`vc-watchbar__act${watched ? " on" : ""}`} onClick={onToggleWatched} aria-pressed={!!watched}>
            <Svg id="check" />
            <span>{t("watch.watched")}</span>
          </button>
        )}
        {onSource && (
          <button className="vc-watchbar__act" onClick={() => setSheet(true)} aria-haspopup="dialog">
            <Svg id="source" />
            <span>{source?.label || t("watch.source")}</span>
          </button>
        )}
      </div>

      {overview && (
        <p
          ref={textRef}
          className={`vc-watchbar__overview${more ? " is-open" : ""}`}
          onClick={() => (clamped || more) && setMore((m) => !m)}
        >
          {overview}
          {(clamped || more) && (
            <button className="vc-watchbar__more" onClick={(e) => { e.stopPropagation(); setMore((m) => !m); }}>
              {more ? t("watch.less") : t("watch.more")}
            </button>
          )}
        </p>
      )}

      {sheet && (
        <div className="vc-watchsheet" role="dialog" aria-modal="true" aria-label={t("watch.source")} onClick={() => setSheet(false)}>
          <div className="vc-watchsheet__panel" onClick={(e) => e.stopPropagation()}>
            <div className="vc-watchsheet__grab" aria-hidden="true" />
            <h2>{t("watch.source")}</h2>
            {PLAYER_SOURCES.map((s) => (
              <button
                key={s.id}
                className={`vc-watchsheet__item${s.id === sourceId ? " on" : ""}`}
                onClick={() => {
                  setSheet(false);
                  if (s.id !== sourceId) onSource(s.id);
                }}
              >
                <span>{s.label}</span>
                {s.id === sourceId && <Svg id="check" size={20} />}
              </button>
            ))}
            <p className="vc-watchsheet__hint">{t("watch.sourceHint")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
