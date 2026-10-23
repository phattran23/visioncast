import { useMemo } from "react";
import { useT, useLang } from "../utils/i18n";

// Films / Series filter bar (design: "VisionCast — Films & Series filters").
// A sticky glass bar with Genre / Country (multi-select) and Sort triggers;
// each opens a glass panel. Active filters show as removable chips below.

// Countries grouped by region (ISO 3166-1); names come from Intl.DisplayNames
export const REGIONS = [
  { key: "filter.asia", codes: ["VN", "JP", "KR", "CN", "HK", "TW", "TH", "IN", "PH", "ID"] },
  { key: "filter.europe", codes: ["GB", "FR", "IT", "ES", "DE", "IE", "DK", "SE"] },
  { key: "filter.americas", codes: ["US", "CA", "MX", "BR", "AR"] },
  { key: "filter.africaOceania", codes: ["NG", "ZA", "EG", "AU", "NZ"] },
];

// Accent dot per TMDB genre id (movie + tv ids)
const GENRE_COLORS = {
  28: "#FF5A36", 12: "#D9A441", 16: "#9BE564", 35: "#FFD36B", 80: "#C8374B",
  99: "#F4F1EA", 18: "#B9A7FF", 10751: "#6FD3A5", 14: "#6FD3A5", 36: "#D9A441",
  27: "#C8374B", 10402: "#FF8A5C", 9648: "#7FA6FF", 10749: "#F4A3C0", 878: "#5FD0E6",
  10770: "#B9A7FF", 53: "#FF5A36", 10752: "#9A9AA4", 37: "#D9A441",
  10759: "#FF5A36", 10762: "#9BE564", 10763: "#F4F1EA", 10764: "#FFD36B",
  10765: "#5FD0E6", 10766: "#F4A3C0", 10767: "#FF8A5C", 10768: "#9A9AA4",
};

const Check = () => (
  <svg className="vc-fchk" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF5A36" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const Chevron = () => (
  <svg className="vc-trig__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const ICONS = {
  genre: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M8 5v14M16 5v14M3.5 9.5H8M16 9.5h4.5M3.5 14.5H8M16 14.5h4.5" />
    </svg>
  ),
  country: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5c-2.6-2.6-3.6-5.4-3.6-8.5s1-5.9 3.6-8.5z" />
    </svg>
  ),
  sort: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5" />
    </svg>
  ),
};

export function useCountryNames() {
  const lang = useLang();
  return useMemo(() => {
    let dn = null;
    try {
      dn = new Intl.DisplayNames([lang === "vi" ? "vi" : "en"], { type: "region" });
    } catch {}
    return (code) => dn?.of(code) || code;
  }, [lang]);
}

function Trigger({ id, label, count, open, onToggle }) {
  return (
    <button
      type="button"
      className="vc-trig"
      aria-expanded={open}
      aria-haspopup="true"
      onClick={onToggle}
    >
      {ICONS[id]}
      {label}
      {count > 0 && <span className="vc-trig__badge">{count}</span>}
      <Chevron />
    </button>
  );
}

function PanelFooter({ t, onClear, onDone, showLabel }) {
  return (
    <div className="vc-fpanel__foot">
      <button type="button" className="vc-flink" onClick={onClear}>
        {t("filter.clearOne")}
      </button>
      <button type="button" className="vc-fshow" onClick={onDone}>
        {showLabel}
      </button>
    </div>
  );
}

export default function FilterBar({
  genres, // [{ id, name }]
  selGenres, // [id]
  selCountries, // [code]
  sort, // "popular" | "rated" | "newest"
  sorts, // { id: { key } }
  open, // null | "genre" | "country" | "sort"
  onOpen,
  onToggleGenre,
  onToggleCountry,
  onClearGenres,
  onClearCountries,
  onSort,
  onReset,
  countLabel,
  loading,
}) {
  const t = useT();
  const countryName = useCountryNames();
  const toggle = (id) => onOpen(open === id ? null : id);
  const showLabel = loading ? t("auth.busy") : t("filter.show", { count: countLabel });
  const genreName = (id) => genres.find((g) => g.id === id)?.name || "";
  const anyFilter = selGenres.length + selCountries.length > 0;

  return (
    <>
      <div className="vc-fbar glass" role="search" aria-label={t("filter.title")}>
        <span className="vc-fbar__label">{t("filter.title")}</span>

        <div className="vc-fbar__slot">
          <Trigger id="genre" label={t("filter.genre")} count={selGenres.length} open={open === "genre"} onToggle={() => toggle("genre")} />
        </div>
        <div className="vc-fbar__slot">
          <Trigger id="country" label={t("filter.country")} count={selCountries.length} open={open === "country"} onToggle={() => toggle("country")} />
        </div>
        <div className="vc-fbar__slot">
          <Trigger id="sort" label={t(sorts[sort].key)} count={0} open={open === "sort"} onToggle={() => toggle("sort")} />
        </div>

        {anyFilter && (
          <button type="button" className="vc-flink vc-fbar__reset" onClick={onReset}>
            {t("filter.reset")}
          </button>
        )}
        <span className="vc-fbar__count" aria-live="polite">
          {loading ? t("auth.busy") : countLabel}
        </span>

        {open === "genre" && (
          <div className="vc-fpanel vc-fpanel--genre" role="group" aria-label={t("filter.genre")}>
            <div className="vc-fpanel__pills">
              {genres.map((g, i) => {
                const on = selGenres.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`vc-gpill${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    onClick={() => onToggleGenre(g.id)}
                    style={{ animationDelay: `${i * 0.025}s` }}
                  >
                    <span className="vc-gpill__dot" style={{ background: GENRE_COLORS[g.id] || "#9A9AA4" }} aria-hidden="true" />
                    {g.name}
                    <Check />
                  </button>
                );
              })}
            </div>
            <PanelFooter t={t} onClear={onClearGenres} onDone={() => onOpen(null)} showLabel={showLabel} />
          </div>
        )}

        {open === "country" && (
          <div className="vc-fpanel vc-fpanel--country" role="group" aria-label={t("filter.country")}>
            <div className="vc-fpanel__regions">
              {REGIONS.map((r, ri) => (
                <div key={r.key}>
                  <div className="vc-fpanel__region">{t(r.key)}</div>
                  <div className="vc-fpanel__list">
                    {r.codes.map((code, i) => {
                      const on = selCountries.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          className={`vc-crow${on ? " is-on" : ""}`}
                          aria-pressed={on}
                          onClick={() => onToggleCountry(code)}
                          style={{ animationDelay: `${(ri * 6 + i) * 0.02}s` }}
                        >
                          <span className="vc-crow__code">{code}</span>
                          {countryName(code)}
                          <Check />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <PanelFooter t={t} onClear={onClearCountries} onDone={() => onOpen(null)} showLabel={showLabel} />
          </div>
        )}

        {open === "sort" && (
          <div className="vc-fpanel vc-fpanel--sort" role="group" aria-label={t("filter.sort")}>
            <div className="vc-fpanel__list">
              {Object.entries(sorts).map(([id, s], i) => (
                <button
                  key={id}
                  type="button"
                  className={`vc-crow${sort === id ? " is-on" : ""}`}
                  aria-pressed={sort === id}
                  onClick={() => {
                    onSort(id);
                    onOpen(null);
                  }}
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  {t(s.key)}
                  <Check />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {open && (
        <button
          type="button"
          className="vc-fbar__scrim"
          aria-label={t("filter.close")}
          tabIndex={-1}
          onClick={() => onOpen(null)}
        />
      )}

      <div className="vc-fchips">
        {selCountries.map((c) => (
          <button key={c} type="button" className="vc-fchip" aria-label={`${t("filter.remove")} ${countryName(c)}`} onClick={() => onToggleCountry(c)}>
            {countryName(c)}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8" /></svg>
          </button>
        ))}
        {selGenres.map((g) => (
          <button key={g} type="button" className="vc-fchip" aria-label={`${t("filter.remove")} ${genreName(g)}`} onClick={() => onToggleGenre(g)}>
            {genreName(g)}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8" /></svg>
          </button>
        ))}
      </div>
    </>
  );
}
