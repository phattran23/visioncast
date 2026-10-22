import {
  VisionCastMark,
  VisionCastWordmark,
  HomeIcon,
  SearchIcon,
  BookmarkIcon,
  SettingsIcon,
  BackIcon,
} from "./Icons";

// Halo navigation: a floating glass pill at the top on desktop, and on phones a
// slim top bar (back + logo) plus a floating glass tab bar at the bottom.
// Replaces the desktop app's sidebar.

const LINKS = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "history", label: "Library", icon: BookmarkIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
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
}) {
  return (
    <>
      {/* ── Desktop: top glass pill ── */}
      <header className="halo-topnav">
        <div className="halo-pill glass">
          {canGoBack && (
            <button
              className="halo-icon-btn halo-icon-btn--ghost"
              onClick={onBack}
              aria-label="Back"
              title="Back (Ctrl+Z)"
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
                {l.label}
              </button>
            ))}
          </nav>
          <button
            className="halo-icon-btn"
            onClick={onSearch}
            aria-label="Search"
            title="Search (⌘F)"
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
            aria-label="Back"
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
        <TabBtn
          label="Home"
          icon={HomeIcon}
          active={page === "home"}
          onClick={() => onNavigate("home")}
        />
        <TabBtn label="Search" icon={SearchIcon} onClick={onSearch} />
        <TabBtn
          label="Library"
          icon={BookmarkIcon}
          active={page === "history"}
          onClick={() => onNavigate("history")}
        />
        <TabBtn
          label="Settings"
          icon={SettingsIcon}
          active={page === "settings"}
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
