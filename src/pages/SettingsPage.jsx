import { useState, useRef, useEffect } from "react";
import { storage, STORAGE_KEYS } from "../utils/storage";
import { clearTmdbCache } from "../utils/api";
import {
  applyAccentColor,
  applyTheme,
  APPEARANCE_MODES,
  getAppearanceMode,
  DEFAULT_THEME,
} from "../utils/appearance";
import { loadHomeViewMode, saveHomeViewMode } from "../utils/homeLayout";
import {
  LANGUAGES,
  LANG_EVENT,
  useT,
  useLang,
  getSubtitleLang,
} from "../utils/i18n";
import {
  getAuthMode,
  getAccount,
  signOut,
  showAuthScreen,
} from "../utils/account";

// VisionCast settings: one short page of instant-apply controls.

const AGE_LIMITS = ["", "0", "7", "12", "13", "16", "18"];
const SORTS = [
  { value: "manual", key: "settings.sortManual" },
  { value: "title", key: "settings.sortTitle" },
  { value: "rating", key: "settings.sortRating" },
  { value: "year", key: "settings.sortYear" },
];

// "Saved" flash shown next to a section title after a change
function useFlash() {
  const [on, setOn] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    on,
    () => {
      setOn(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setOn(false), 1600);
    },
  ];
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="vc-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`vc-seg__btn${value === o.value ? " is-active" : ""}`}
          aria-pressed={value === o.value}
          onClick={() => value !== o.value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`vc-switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="vc-switch__knob" />
    </button>
  );
}

function Select({ id, value, options, onChange }) {
  return (
    <select
      id={id}
      className="vc-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Card({ title, saved, savedLabel, children }) {
  return (
    <section className="vc-card">
      <h2 className="vc-card__title">
        {title}
        <span className={`vc-saved${saved ? " is-on" : ""}`} aria-live="polite">
          {saved ? `✓ ${savedLabel}` : ""}
        </span>
      </h2>
      {children}
    </section>
  );
}

function Row({ label, htmlFor, desc, children }) {
  return (
    <div className="vc-row">
      <div className="vc-row__text">
        {htmlFor ? (
          <label className="vc-row__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <div className="vc-row__label">{label}</div>
        )}
        {desc && <div className="vc-row__desc">{desc}</div>}
      </div>
      <div className="vc-row__control">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const t = useT();
  const lang = useLang();

  // Language + appearance
  const [mode, setMode] = useState(() =>
    getAppearanceMode(storage.get(STORAGE_KEYS.THEME) || DEFAULT_THEME),
  );
  const [generalSaved, flashGeneral] = useFlash();
  const [subLang, setSubLang] = useState(getSubtitleLang);

  const changeLang = (id) => {
    const l = LANGUAGES.find((x) => x.id === id);
    storage.set(STORAGE_KEYS.TMDB_LANG, l.tmdb);
    // Subtitles default to the chosen language
    storage.set(STORAGE_KEYS.SUBTITLE_LANG, id);
    setSubLang(id);
    clearTmdbCache();
    window.dispatchEvent(new CustomEvent(LANG_EVENT));
    flashGeneral();
  };

  const changeSubLang = (id) => {
    storage.set(STORAGE_KEYS.SUBTITLE_LANG, id);
    setSubLang(id);
    window.dispatchEvent(new CustomEvent("streambert:player-settings-changed"));
    flashGeneral();
  };

  const changeMode = (m) => {
    const { theme, accent } = APPEARANCE_MODES[m];
    storage.set(STORAGE_KEYS.THEME, theme);
    storage.set(STORAGE_KEYS.ACCENT_COLOR, accent);
    applyTheme(theme);
    applyAccentColor(accent);
    setMode(m);
    flashGeneral();
  };

  // Parental controls
  const [ageLimit, setAgeLimit] = useState(() => {
    const v = storage.get(STORAGE_KEYS.AGE_LIMIT);
    return v === null || v === undefined ? "" : String(v);
  });
  const [ageSaved, flashAge] = useFlash();
  const changeAge = (v) => {
    setAgeLimit(v);
    if (v === "") storage.remove(STORAGE_KEYS.AGE_LIMIT);
    else storage.set(STORAGE_KEYS.AGE_LIMIT, Number(v));
    flashAge();
  };

  // Home page
  const [viewMode, setViewMode] = useState(() => loadHomeViewMode());
  const [startPage, setStartPage] = useState(
    () => storage.get(STORAGE_KEYS.START_PAGE) || "home",
  );
  const [homeSaved, flashHome] = useFlash();
  const changeView = (v) => {
    saveHomeViewMode(v);
    setViewMode(v);
    flashHome();
  };
  const changeStart = (v) => {
    storage.set(STORAGE_KEYS.START_PAGE, v);
    setStartPage(v);
    flashHome();
  };

  // Library & privacy
  const [sort, setSort] = useState(
    () => storage.get(STORAGE_KEYS.LIBRARY_SORT) || "manual",
  );
  const [history, setHistory] = useState(() => {
    const v = storage.get(STORAGE_KEYS.HISTORY_ENABLED);
    return !(v === 0 || v === false);
  });
  const [libSaved, flashLib] = useFlash();
  const changeSort = (v) => {
    storage.set(STORAGE_KEYS.LIBRARY_SORT, v);
    setSort(v);
    window.dispatchEvent(
      new CustomEvent("streambert:library-sort-changed", { detail: v }),
    );
    flashLib();
  };
  const changeHistory = (on) => {
    storage.set(STORAGE_KEYS.HISTORY_ENABLED, on ? 1 : 0);
    setHistory(on);
    flashLib();
  };

  const saved = t("settings.saved");

  // Account
  const account = getAuthMode() === "user" ? getAccount() : null;
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    window.location.reload();
  };
  const handleSignIn = () => {
    showAuthScreen();
    window.dispatchEvent(new CustomEvent("visioncast:auth-changed"));
  };

  return (
    <div className="vc-settings fade-in">
      <h1 className="vc-settings__title">{t("settings.title")}</h1>

      <section className="vc-card vc-account">
        <div className="vc-account__avatar" aria-hidden="true">
          {account ? (account.name || "?").trim().charAt(0).toUpperCase() : "?"}
        </div>
        <div className="vc-account__text">
          <div className="vc-account__name">
            {account ? t("account.signedIn", { name: account.name }) : t("account.guest")}
          </div>
          <div className="vc-row__desc">
            {account ? `${account.email} · ${t("account.synced")}` : t("account.guestDesc")}
          </div>
        </div>
        {account ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {t("account.signOut")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={handleSignIn}>
            {t("account.signInOrCreate")}
          </button>
        )}
      </section>

      <Card title={t("settings.general")} saved={generalSaved} savedLabel={saved}>
        <Row label={t("settings.language")} desc={t("settings.languageDesc")}>
          <Segmented
            label={t("settings.language")}
            value={lang}
            options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
            onChange={changeLang}
          />
        </Row>
        <Row label={t("settings.subtitles")} desc={t("settings.subtitlesDesc")}>
          <Segmented
            label={t("settings.subtitles")}
            value={subLang}
            options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
            onChange={changeSubLang}
          />
        </Row>
        <Row label={t("settings.appearance")}>
          <Segmented
            label={t("settings.appearance")}
            value={mode}
            options={[
              { value: "dark", label: t("settings.dark") },
              { value: "light", label: t("settings.light") },
            ]}
            onChange={changeMode}
          />
        </Row>
      </Card>

      <Card title={t("settings.parental")} saved={ageSaved} savedLabel={saved}>
        <Row
          label={t("settings.maxAge")}
          htmlFor="vc-age"
          desc={t("settings.parentalDesc")}
        >
          <Select
            id="vc-age"
            value={ageLimit}
            onChange={changeAge}
            options={AGE_LIMITS.map((a) => ({
              value: a,
              label: a === "" ? t("settings.noLimit") : t("settings.age", { age: a }),
            }))}
          />
        </Row>
      </Card>

      <Card title={t("settings.home")} saved={homeSaved} savedLabel={saved}>
        <Row label={t("settings.startPage")}>
          <Segmented
            label={t("settings.startPage")}
            value={startPage}
            options={[
              { value: "home", label: t("nav.home") },
              { value: "history", label: t("nav.library") },
            ]}
            onChange={changeStart}
          />
        </Row>
        <Row label={t("settings.layout")}>
          <Segmented
            label={t("settings.layout")}
            value={viewMode === "list" ? "list" : "carousel"}
            options={[
              { value: "carousel", label: t("settings.rails") },
              { value: "list", label: t("settings.grid") },
            ]}
            onChange={changeView}
          />
        </Row>
      </Card>

      <Card title={t("settings.library")} saved={libSaved} savedLabel={saved}>
        <Row label={t("settings.sort")} htmlFor="vc-sort">
          <Select
            id="vc-sort"
            value={sort}
            onChange={changeSort}
            options={SORTS.map((s) => ({ value: s.value, label: t(s.key) }))}
          />
        </Row>
        <Row label={t("settings.history")} desc={t("settings.historyDesc")}>
          <Switch
            label={t("settings.history")}
            checked={history}
            onChange={changeHistory}
          />
        </Row>
      </Card>
    </div>
  );
}
