import { useEffect, useMemo, useState } from "react";
import { imgUrl, tmdbFetch } from "../utils/api";
import { PlayIcon } from "../components/Icons";
import { useT, useLang } from "../utils/i18n";
import { hasReminder, toggleReminder, REMINDERS_EVENT } from "../utils/reminders";
import { matchScore, isDisliked } from "../utils/taste";

// New & Hot: upcoming releases grouped into a calendar (this week / next
// week / by month) with "Remind me", what everyone is watching this week,
// and today's Top 10 films and series.

const TABS = ["soon", "hot", "top10m", "top10t"];
const DAY = 86400000;

const BellIcon = ({ on }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" />
    <path d="M10 20a2 2 0 004 0" fill="none" />
  </svg>
);
const InfoIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </svg>
);

export default function NewHotPage({ apiKey, aff, onPreview, onPlay }) {
  const t = useT();
  const lang = useLang();
  const [tab, setTab] = useState("soon");
  const [data, setData] = useState({});
  const [, bump] = useState(0);

  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(REMINDERS_EVENT, on);
    return () => window.removeEventListener(REMINDERS_EVENT, on);
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    let off = false;
    const region = lang === "vi" ? "VN" : "US";
    const today = new Date().toISOString().slice(0, 10);
    const as = (type) => (d) => (d.results || []).map((i) => ({ ...i, media_type: i.media_type || type }));
    Promise.all([
      Promise.all([1, 2].map((p) => tmdbFetch(`/movie/upcoming?region=${region}&page=${p}`, apiKey).then(as("movie")).catch(() => []))).then((l) =>
        l
          .flat()
          .filter((i) => i.release_date > today)
          .filter((i, n, a) => a.findIndex((x) => x.id === i.id) === n)
          .sort((a, b) => a.release_date.localeCompare(b.release_date)),
      ),
      tmdbFetch(`/trending/all/week`, apiKey).then((d) => as("movie")(d).filter((i) => i.media_type === "movie" || i.media_type === "tv")).catch(() => []),
      tmdbFetch(`/trending/movie/day`, apiKey).then(as("movie")).catch(() => []),
      tmdbFetch(`/trending/tv/day`, apiKey).then(as("tv")).catch(() => []),
    ]).then(([soon, hot, top10m, top10t]) => {
      if (off) return;
      const clean = (l) => l.filter((i) => (i.backdrop_path || i.poster_path) && !isDisliked(i));
      setData({ soon: clean(soon), hot: clean(hot), top10m: clean(top10m).slice(0, 10), top10t: clean(top10t).slice(0, 10) });
    });
    return () => {
      off = true;
    };
  }, [apiKey, lang]);

  const locale = lang === "vi" ? "vi-VN" : "en-US";

  // Calendar groups for upcoming releases
  const groups = useMemo(() => {
    const out = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (const i of data.soon || []) {
      const d = new Date(`${i.release_date}T00:00:00`);
      const days = Math.round((d - now) / DAY);
      const raw =
        days < 7
          ? t("new.thisWeek")
          : days < 14
            ? t("new.nextWeek")
            : d.toLocaleDateString(locale, { month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
      const label = raw.charAt(0).toUpperCase() + raw.slice(1);
      const g = out[out.length - 1];
      if (g && g.label === label) g.items.push(i);
      else out.push({ label, items: [i] });
    }
    return out;
  }, [data.soon, t, locale]);

  const entry = (i, { rank, upcoming } = {}) => {
    const title = i.title || i.name;
    const date = i.release_date || i.first_air_date;
    const d = date ? new Date(`${date}T00:00:00`) : null;
    const reminded = upcoming && hasReminder(i);
    const m = matchScore(i, aff);
    return (
      <article key={`${i.media_type}_${i.id}`} className="nh-item">
        <div className="nh-item__date" aria-hidden={!upcoming && !rank}>
          {rank ? (
            <span className="nh-item__rank">{rank}</span>
          ) : upcoming && d ? (
            <>
              <span className="nh-item__mon">{lang === "vi" ? `Th${d.getMonth() + 1}` : d.toLocaleDateString(locale, { month: "short" })}</span>
              <span className="nh-item__day">{d.getDate()}</span>
            </>
          ) : null}
        </div>
        <div className="nh-item__body">
          <button className="nh-item__art" onClick={() => onPreview(i)} aria-label={title}>
            <img src={imgUrl(i.backdrop_path || i.poster_path, "w780")} alt="" loading="lazy" />
            <span className="nh-item__shade" aria-hidden="true" />
            <span className="nh-item__name">{title}</span>
          </button>
          <div className="nh-item__row">
            <div className="nh-item__info">
              {upcoming && d && (
                <p className="nh-item__when">
                  {t("new.releases", { date: d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }) })}
                </p>
              )}
              <p className="nh-item__facts">
                {m && <b className="nx-match">{t("preview.match", { n: m.score })}</b>}
                <span>{i.media_type === "tv" ? t("media.series") : t("media.movie")}</span>
                {!upcoming && date && <span>{date.slice(0, 4)}</span>}
                {i.vote_average > 0 && !upcoming && <span>★ {i.vote_average.toFixed(1)}</span>}
              </p>
            </div>
            <div className="nh-item__actions">
              {upcoming ? (
                <button
                  className={`nh-act${reminded ? " on" : ""}`}
                  onClick={() => {
                    toggleReminder(i, date);
                    bump((n) => n + 1);
                  }}
                  aria-pressed={reminded}
                >
                  <BellIcon on={reminded} />
                  <span>{reminded ? t("new.reminded") : t("new.remind")}</span>
                </button>
              ) : (
                <button className="nh-act" onClick={() => onPlay(i)}>
                  <PlayIcon />
                  <span>{t("hero.play")}</span>
                </button>
              )}
              <button className="nh-act" onClick={() => onPreview(i)}>
                <InfoIcon />
                <span>{t("new.info")}</span>
              </button>
            </div>
          </div>
          {i.overview && <p className="nh-item__text">{i.overview}</p>}
        </div>
      </article>
    );
  };

  const list = data[tab];

  return (
    <div className="fade-in nh-page">
      <header className="nh-head">
        <h1 className="nh-title">{t("nav.new")}</h1>
        <div className="nh-tabs" role="tablist">
          {TABS.map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`nh-tab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>
              {t(`new.tab.${id}`)}
            </button>
          ))}
        </div>
      </header>

      {!list ? (
        <div className="loader">
          <div className="spinner" />
        </div>
      ) : list.length === 0 ? (
        <p className="nh-empty">{t("new.empty")}</p>
      ) : tab === "soon" ? (
        groups.map((g) => (
          <section key={g.label} className="nh-group">
            <h2 className="nh-group__label">{g.label}</h2>
            {g.items.map((i) => entry(i, { upcoming: true }))}
          </section>
        ))
      ) : (
        <section className="nh-group">{list.map((i, n) => entry(i, { rank: tab.startsWith("top10") ? n + 1 : null }))}</section>
      )}
    </div>
  );
}
