import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { VisionCastMark } from "./Icons";
import { useT, useLang } from "../utils/i18n";
import { getAccount, getAuthMode } from "../utils/account";
import { storage } from "../utils/storage";

// VisionCast dock (design: "VisionCast — Bottom dock navigation"). Open by
// default; a double click / double tap tucks it away into the logo circle and
// one tap on the circle opens it again (remembered). It also slides away while
// a video is full screen. A liquid-glass lens with an orange glow slides under
// the item that is hovered, or the current page.

const I = {
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
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
};

const Svg = ({ children }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ITEMS = [
  { id: "home", key: "nav.home", page: "home" },
  { id: "films", key: "nav.films", page: "films" },
  { id: "series", key: "nav.series", page: "series" },
  { id: "library", key: "nav.library", page: "history" },
  { id: "search", key: "nav.search" },
];

export default function VisionDock({
  page,
  onNavigate,
  onSearch,
  searchOpen,
}) {
  const t = useT();
  const lang = useLang();
  const [hovered, setHovered] = useState(null);
  const [collapsed, setCollapsed] = useState(() => !!storage.get("dockCollapsed"));
  const dockRef = useRef(null);
  const lastTap = useRef(-1e9); // event timeStamp of the previous tap
  const ignoreClickUntil = useRef(0);
  const lastSearchToggle = useRef(0);
  const homeTimer = useRef(null);
  useEffect(() => () => clearTimeout(homeTimer.current), []);

  const setDockCollapsed = (v) => {
    setCollapsed(v);
    storage.set("dockCollapsed", v);
  };

  // Double click / double tap anywhere on the open dock tucks it away.
  // Uses the event's own timestamp so a busy page can't stretch the gap.
  const onDockPointerUp = (e) => {
    const now = Date.now();
    const at = e.timeStamp;
    if (!collapsed && at - lastTap.current < 320) {
      lastTap.current = -1e9;
      ignoreClickUntil.current = now + 400; // swallow the click that follows
      // A double tap is not two taps: cancel what the first tap started
      clearTimeout(homeTimer.current);
      if (now - lastSearchToggle.current < 400) onSearch();
      setHovered(null);
      dockRef.current?.querySelector(":focus")?.blur();
      setDockCollapsed(true);
    } else {
      lastTap.current = at;
    }
  };

  const onLogo = () => {
    if (Date.now() < ignoreClickUntil.current) return;
    if (collapsed) {
      lastTap.current = -1e9;
      setDockCollapsed(false);
    } else {
      // Wait a moment: a second tap means "hide the dock", not "go home"
      clearTimeout(homeTimer.current);
      homeTimer.current = setTimeout(() => onNavigate("home"), 260);
    }
  };
  const itemsRef = useRef(null);
  const innerRef = useRef(null);

  const account = getAuthMode() === "user" ? getAccount() : null;
  const activeIndex = searchOpen
    ? 4
    : ITEMS.findIndex((i) => i.page && i.page === page);
  const lensIndex = hovered ?? (activeIndex >= 0 ? activeIndex : null);

  // Lens position + the dock's open width follow the real item sizes
  const [lens, setLens] = useState({ x: 0, w: 96 });
  const [openW, setOpenW] = useState(660);
  const measureLens = useCallback(() => {
    const items = itemsRef.current?.querySelectorAll(".vc-dock__item");
    if (items && lensIndex != null && items[lensIndex]) {
      const el = items[lensIndex];
      setLens({ x: el.offsetLeft, w: el.offsetWidth });
    }
  }, [lensIndex]);
  useLayoutEffect(measureLens, [measureLens, lang]);
  // Items resize while the dock animates open (and on phones they share the
  // width), so re-measure whenever the row changes size
  useEffect(() => {
    const el = itemsRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measureLens);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureLens]);
  useLayoutEffect(() => {
    if (innerRef.current) setOpenW(innerRef.current.scrollWidth + 18);
  }, [lang, account?.name]);

  const go = (item) => {
    if (Date.now() < ignoreClickUntil.current) return;
    setHovered(null);
    dockRef.current?.querySelector(":focus")?.blur();
    if (item.id === "search") {
      lastSearchToggle.current = Date.now();
      onSearch();
    } else onNavigate(item.page);
  };

  return (
    <>

      <nav
        ref={dockRef}
        className={`vc-dock${collapsed ? "" : " open"}`}
        aria-label="Primary"
        style={{ "--open-w": `${openW}px` }}
        onPointerLeave={() => setHovered(null)}
        onPointerUp={onDockPointerUp}
      >
        <div className="vc-dock__inner" ref={innerRef}>
          <button
            className="vc-dock__logo"
            onClick={onLogo}
            aria-label={collapsed ? t("nav.menu") : "VisionCast home"}
            aria-expanded={!collapsed}
          >
            <VisionCastMark animated />
          </button>
          <div
            className="vc-dock__items"
            ref={itemsRef}
            style={{ "--x": `${lens.x}px`, "--w": `${lens.w}px` }}
          >
            {ITEMS.map((item, i) => (
              <button
                key={item.id}
                className={`vc-dock__item${i === activeIndex ? " on" : ""}`}
                aria-current={i === activeIndex ? "page" : undefined}
                onClick={() => go(item)}
                onMouseEnter={() => setHovered(i)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
              >
                <Svg>{I[item.id]}</Svg>
                <span>{t(item.key)}</span>
              </button>
            ))}
            <span
              className={`vc-dock__glow${lensIndex == null ? " is-off" : ""}`}
              aria-hidden="true"
            />
            <span
              className={`vc-dock__lens${lensIndex == null ? " is-off" : ""}${hovered != null ? " is-hover" : ""}`}
              aria-hidden="true"
            />
          </div>
          <span className="vc-dock__sep" aria-hidden="true" />
          <button
            className={`vc-dock__me${page === "settings" ? " on" : ""}`}
            onClick={() => onNavigate("settings")}
            aria-label={account ? `${account.name} · ${t("nav.settings")}` : t("nav.settings")}
            title={account ? account.name : t("nav.settings")}
          >
            {account ? (
              <span className="vc-dock__initial">{account.name.trim().charAt(0).toUpperCase()}</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c1-4 4-6 8-6s7 2 8 6" />
              </svg>
            )}
          </button>
        </div>
      </nav>
      <span className={`vc-dock-ring${collapsed ? " is-on" : ""}`} aria-hidden="true" />
    </>
  );
}
