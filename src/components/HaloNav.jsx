import {
  VisionCastMark,
  VisionCastWordmark,
  HomeIcon,
  SearchIcon,
  BookmarkIcon,
  SettingsIcon,
  BackIcon,
} from "./Icons";
import { useT } from "../utils/i18n";

// Halo navigation: a floating glass pill at the top on desktop, and on phones a
// slim top bar (back + logo) plus a floating glass tab bar at the bottom.
// Replaces the desktop app's sidebar.

const LINKS = [
  { id: "home", key: "nav.home", icon: HomeIcon },
  { id: "history", key: "nav.library", icon: BookmarkIcon },
  { id: "settings", key: "nav.settings", icon: SettingsIcon },
];

function Brand({ onClick }) {
  return (
    <button className="halo-brand" onClick={onClick} aria-label="VisionCast home">
      <span className="halo-brand__logo" aria-hidden="true">
        <VisionCastMark animated />
      </span>
      <VisionCastWordmark />
    </button>
  );
}

export default function HaloNav({
  page,
  onNavigate,
  onSearch,
  canGoBack,
  onBack,
  searchOpen,
}) {
  const t = useT();
  // Which bottom tab the sliding indicator sits under (-1 = none, e.g. a title page)
  const tabIndex = searchOpen
    ? 1
    : { home: 0, history: 2, settings: 3 }[page] ?? -1;
  return (
    <>
      {/* ── Desktop: top glass pill ── */}
      <header className="halo-topnav">
        <div className="halo-pill glass">
          {canGoBack && (
            <button
              className="halo-icon-btn halo-icon-btn--ghost"
              onClick={onBack}
              aria-label={t("nav.back")}
              title={`${t("nav.back")} (Ctrl+Z)`}
            >
              <BackIcon />
            </button>
          )}
          <Brand onClick={() => onNavigate("home")} />
          <nav className="halo-links" aria-label="Primary">
            {LINKS.map((l) => (
              <button
                key={l.id}
                className={`halo-link${page === l.id ? " is-active" : ""}`}
                aria-current={page === l.id ? "page" : undefined}
                onClick={() => onNavigate(l.id)}
              >
                {t(l.key)}
              </button>
            ))}
          </nav>
          <button
            className="halo-icon-btn"
            onClick={onSearch}
            aria-label={t("nav.search")}
            title={`${t("nav.search")} (⌘F)`}
          >
            <SearchIcon />
          </button>
        </div>
      </header>

      {/* ── Mobile: top bar ── */}
      <header className="halo-mobilebar">
        {canGoBack ? (
          <button
            className="halo-icon-btn glass"
            onClick={onBack}
            aria-label={t("nav.back")}
          >
            <BackIcon />
          </button>
        ) : (
          <Brand onClick={() => onNavigate("home")} />
        )}
        {canGoBack && <Brand onClick={() => onNavigate("home")} />}
        <span className="halo-mobilebar__spacer" />
      </header>

      {/* ── Mobile: bottom tab bar ── */}
      <nav className="halo-tabbar glass" aria-label="Primary">
        <span
          className="halo-tab-indicator"
          aria-hidden="true"
          style={{
            "--tab": tabIndex < 0 ? 0 : tabIndex,
            opacity: tabIndex < 0 ? 0 : 1,
          }}
        />
        <TabBtn
          label={t("nav.home")}
          icon={HomeIcon}
          active={!searchOpen && page === "home"}
          onClick={() => onNavigate("home")}
        />
        <TabBtn
          label={t("nav.search")}
          icon={SearchIcon}
          active={!!searchOpen}
          onClick={onSearch}
        />
        <TabBtn
          label={t("nav.library")}
          icon={BookmarkIcon}
          active={!searchOpen && page === "history"}
          onClick={() => onNavigate("history")}
        />
        <TabBtn
          label={t("nav.settings")}
          icon={SettingsIcon}
          active={!searchOpen && page === "settings"}
          onClick={() => onNavigate("settings")}
        />
      </nav>
    </>
  );
}

function TabBtn({ label, icon: Icon, active, onClick }) {
  return (
    <button
      className={`halo-tab${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <Icon />
      <span>{label}</span>
    </button>
  );
}
