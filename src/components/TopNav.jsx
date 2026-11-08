import { useEffect, useRef, useState } from "react";
import { VisionCastMark, VisionCastWordmark } from "./Icons";
import { useT } from "../utils/i18n";
import { getAccount, getAuthMode } from "../utils/account";

// Streaming-style navigation.
//   Wide screens: one bar across the top: logo, page links, search, account.
//     It sits transparent over the billboard and turns solid once the page
//     scrolls.
//   Phones: a slim top bar (logo, search, account) with quick chips on the
//     home page, plus a fixed tab bar at the bottom.
// Both slide away while a video is full screen (body.vc-fullscreen).

const ICONS = {
  home: <path d="M4 11l8-7 8 7v9H4z" />,
  films: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M8 5v14M16 5v14M3.5 9.5H8M16 9.5h4.5M3.5 14.5H8M16 14.5h4.5" />
    </>
  ),
  series: (
    <>
      <path d="M12 4l8.5 4.5L12 13 3.5 8.5z" />
      <path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
    </>
  ),
  library: <path d="M6 4h12v16l-6-4-6 4z" />,
  new: (
    <>
      <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 01-8 0c0-1.6.7-2.8 1.6-3.7.3 1.4 1 2.2 2 2.4-.6-2.4-.2-4.9.4-7.2z" />
      <path d="M8.5 15.5A4.5 4.5 0 0012 21a4.5 4.5 0 003.5-5.5" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" />
      <circle cx="15" cy="9" r="1.1" fill="currentColor" />
      <circle cx="9" cy="15" r="1.1" fill="currentColor" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
};

const Icon = ({ id, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[id]}
  </svg>
);

const LINKS = [
  { id: "home", key: "nav.home", page: "home" },
  { id: "films", key: "nav.films", page: "films" },
  { id: "series", key: "nav.series", page: "series" },
  { id: "new", key: "nav.new", page: "new" },
  { id: "library", key: "nav.library", page: "history" },
];
// Phones: films / series live in the chips; the tab bar keeps four places
const TABS = ["home", "new", "search", "library"];

export default function TopNav({ page, canBack, onBack, onNavigate, onSearch, searchOpen, onPick }) {
  const t = useT();
  const ref = useRef(null);
  const [solid, setSolid] = useState(false);

  // Solid once the page scrolls (the scroller is .main)
  useEffect(() => {
    const main = ref.current?.closest(".main");
    if (!main) return;
    const on = () => setSolid(main.scrollTop > 8);
    on();
    main.addEventListener("scroll", on, { passive: true });
    return () => main.removeEventListener("scroll", on);
  }, [page]);

  const account = getAuthMode() === "user" ? getAccount() : null;
  const go = (p) => onNavigate(p);

  const avatar = (
    <button
      className={`vc-nav__me${page === "settings" ? " on" : ""}`}
      onClick={() => go("settings")}
      aria-label={account ? `${account.name} · ${t("nav.settings")}` : t("nav.settings")}
      title={account ? account.name : t("nav.settings")}
    >
      {account ? (
        <span>{account.name.trim().charAt(0).toUpperCase()}</span>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1-4 4-6 8-6s7 2 8 6" />
        </svg>
      )}
    </button>
  );

  return (
    <>
      <header ref={ref} className={`vc-nav${solid ? " is-solid" : ""}`}>
        <div className="vc-nav__row">
          {canBack && (
            <button
              className={`vc-nav__back${["home", "films", "series", "new", "history", "settings"].includes(page) ? " is-root" : ""}`}
              onClick={onBack} aria-label={t("nav.back")} title={t("nav.back")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          )}
          <button className="vc-nav__brand" onClick={() => go("home")} aria-label="VisionCast home">
            <span className="vc-nav__mark">
              <VisionCastMark animated />
            </span>
            <span className="vc-nav__word">
              <VisionCastWordmark />
            </span>
          </button>

          <nav className="vc-nav__links" aria-label="Primary">
            {LINKS.map((l) => (
              <button
                key={l.id}
                className={`vc-nav__link${page === l.page ? " on" : ""}`}
                aria-current={page === l.page ? "page" : undefined}
                onClick={() => go(l.page)}
              >
                {t(l.key)}
              </button>
            ))}
          </nav>

          <div className="vc-nav__right">
            {onPick && (
              <button className="vc-nav__pick" onClick={onPick} title={t("pick.title")}>
                <Icon id="dice" size={20} />
                <span>{t("pick.short")}</span>
              </button>
            )}
            <button
              className={`vc-nav__icon${searchOpen ? " on" : ""}`}
              onClick={onSearch}
              aria-label={t("nav.search")}
              title={t("nav.search")}
            >
              <Icon id="search" />
            </button>
            {avatar}
          </div>
        </div>

        {/* Phones: quick chips under the bar on the home page */}
        {page === "home" && (
          <div className="vc-nav__chips">
            <button className="vc-nav__chip" onClick={() => go("films")}>{t("nav.films")}</button>
            <button className="vc-nav__chip" onClick={() => go("series")}>{t("nav.series")}</button>
            {onPick && (
              <button className="vc-nav__chip vc-nav__chip--pick" onClick={onPick}>
                <Icon id="dice" size={16} /> {t("pick.short")}
              </button>
            )}
          </div>
        )}
      </header>

      {/* Phones: bottom tab bar */}
      <nav className="vc-tabs" aria-label="Primary">
        {TABS.map((id) => (id === "search" ? { id, key: "nav.search" } : LINKS.find((l) => l.id === id))).map((l) => {
          const on = l.id === "search" ? searchOpen : !searchOpen && page === l.page;
          return (
            <button
              key={l.id}
              className={`vc-tabs__item${on ? " on" : ""}`}
              aria-current={on ? "page" : undefined}
              onClick={() => (l.id === "search" ? onSearch() : go(l.page))}
            >
              <Icon id={l.id} size={23} />
              <span>{t(l.key)}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
