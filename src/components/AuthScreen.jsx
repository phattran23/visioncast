import { useState, useEffect } from "react";
import { imgUrl, tmdbFetch, clearTmdbCache } from "../utils/api";
import { storage, STORAGE_KEYS } from "../utils/storage";
import { LANGUAGES, LANG_EVENT, useT, useLang } from "../utils/i18n";
import {
  signIn,
  signUp,
  continueAsGuest,
  passwordStrength,
} from "../utils/account";
import { VisionCastMark, VisionCastWordmark } from "./Icons";

// Sign in / Sign up / Guest, per the VisionCast auth design: cross-fading
// artwork on one side (a banner on phones), a glass three-way switcher and
// the form on the other.

const MODES = ["in", "up", "guest"];

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const DashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 12h12" />
  </svg>
);

function PasswordField({ id, value, onChange, placeholder, autoComplete, t }) {
  const [show, setShow] = useState(false);
  return (
    <div className="vc-auth__pw">
      <input
        id={id}
        className="vc-field"
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={autoComplete === "new-password" ? 8 : undefined}
      />
      <button
        type="button"
        className="vc-auth__pw-toggle"
        onClick={() => setShow((v) => !v)}
        aria-pressed={show}
      >
        {show ? t("auth.hide") : t("auth.show")}
      </button>
    </div>
  );
}

export default function AuthScreen({ apiKey, onDone }) {
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Cross-fading artwork from this week's trending titles
  const [art, setArt] = useState([]);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (!apiKey) return;
    tmdbFetch("/trending/movie/week", apiKey)
      .then((d) =>
        setArt((d.results || []).filter((m) => m.poster_path && m.backdrop_path).slice(0, 4)),
      )
      .catch(() => {});
  }, [apiKey]);
  useEffect(() => {
    if (art.length < 2) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % art.length), 5000);
    return () => clearInterval(id);
  }, [art.length]);

  const switchMode = (m) => {
    setMode(m);
    setError(null);
  };

  const changeLang = (id) => {
    const l = LANGUAGES.find((x) => x.id === id);
    storage.set(STORAGE_KEYS.TMDB_LANG, l.tmdb);
    clearTmdbCache();
    window.dispatchEvent(new CustomEvent(LANG_EVENT));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r =
      mode === "up"
        ? await signUp({ name, email, password })
        : await signIn({ email, password });
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone("user");
  };

  const strength = passwordStrength(password);
  const errText = error && (t(`auth.err.${error}`) !== `auth.err.${error}` ? t(`auth.err.${error}`) : t("auth.err.server_error"));

  return (
    <div className="vc-auth">
      <section className="vc-auth__art" aria-hidden="true">
        {art.map((m, n) => (
          <picture key={m.id} className={`vc-auth__slide${n === slide ? " is-active" : ""}`}>
            <source media="(max-width: 860px)" srcSet={imgUrl(m.backdrop_path, "w1280")} />
            <img src={imgUrl(m.poster_path, "w780")} alt="" />
          </picture>
        ))}
        <div className="vc-auth__shade" />
        <div className="vc-auth__brand">
          <span className="vc-auth__mark">
            <VisionCastMark animated />
          </span>
          <VisionCastWordmark />
        </div>
        <div className="vc-auth__tagline">
          <h2>
            {t("auth.tagline1")}
            <br />
            {t("auth.tagline2")}
          </h2>
          <p>{t("auth.taglineSub")}</p>
        </div>
      </section>

      <section className="vc-auth__panel">
        <div className="vc-auth__inner">
          <div className="vc-auth__lang" role="group" aria-label="Language">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                className={lang === l.id ? "is-active" : ""}
                aria-pressed={lang === l.id}
                onClick={() => lang !== l.id && changeLang(l.id)}
              >
                {l.id.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="vc-auth__tabs glass" role="tablist" aria-label={t("account.title")}>
            <span
              className="vc-auth__tab-ind"
              aria-hidden="true"
              style={{ transform: `translateX(${MODES.indexOf(mode) * 100}%)` }}
            />
            {MODES.map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                className={mode === m ? "is-active" : ""}
                onClick={() => switchMode(m)}
              >
                {t(m === "in" ? "auth.tabIn" : m === "up" ? "auth.tabUp" : "auth.tabGuest")}
              </button>
            ))}
          </div>

          {mode !== "guest" ? (
            <form key={mode} className="vc-auth__pane" onSubmit={submit} noValidate>
              <div>
                <h1>{t(mode === "in" ? "auth.inTitle" : "auth.upTitle")}</h1>
                <p className="vc-auth__sub">{t(mode === "in" ? "auth.inSub" : "auth.upSub")}</p>
              </div>
              {mode === "up" && (
                <div className="vc-auth__group">
                  <label htmlFor="vc-name">{t("auth.name")}</label>
                  <input
                    id="vc-name"
                    className="vc-field"
                    type="text"
                    autoComplete="name"
                    placeholder={t("auth.namePh")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="vc-auth__group">
                <label htmlFor="vc-email">{t("auth.email")}</label>
                <input
                  id="vc-email"
                  className="vc-field"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t("auth.emailPh")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="vc-auth__group">
                <label htmlFor="vc-pw">{t("auth.password")}</label>
                <PasswordField
                  id="vc-pw"
                  value={password}
                  onChange={setPassword}
                  t={t}
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  placeholder={t(mode === "up" ? "auth.newPasswordPh" : "auth.passwordPh")}
                />
                {mode === "up" && (
                  <div className="vc-auth__strength">
                    <div className="vc-auth__bars" aria-hidden="true">
                      {[0, 1, 2, 3].map((n) => (
                        <span key={n} className={n < strength ? "is-on" : ""} />
                      ))}
                    </div>
                    <span>{password ? t(`auth.strength${strength}`) : t("auth.strengthHint")}</span>
                  </div>
                )}
              </div>
              {errText && (
                <div className="vc-auth__error" role="alert">
                  {errText}
                </div>
              )}
              <button className="vc-auth__cta" type="submit" disabled={busy}>
                {busy ? t("auth.busy") : t(mode === "in" ? "auth.signIn" : "auth.createAccount")}
              </button>
              <p className="vc-auth__switch">
                {t(mode === "in" ? "auth.newHere" : "auth.member")}{" "}
                <button type="button" onClick={() => switchMode(mode === "in" ? "up" : "in")}>
                  {t(mode === "in" ? "auth.createLink" : "auth.signInLink")}
                </button>
              </p>
            </form>
          ) : (
            <div key="guest" className="vc-auth__pane">
              <div>
                <h1>{t("auth.guestTitle")}</h1>
                <p className="vc-auth__sub">{t("auth.guestSub")}</p>
              </div>
              <ul className="vc-auth__list glass">
                <li>
                  <CheckIcon />
                  {t("auth.guest1")}
                </li>
                <li>
                  <CheckIcon />
                  {t("auth.guest2")}
                </li>
                <li className="is-muted">
                  <DashIcon />
                  {t("auth.guest3")}
                </li>
              </ul>
              <button
                className="vc-auth__cta vc-auth__cta--light"
                type="button"
                onClick={() => {
                  continueAsGuest();
                  onDone("guest");
                }}
              >
                {t("auth.continueGuest")}
              </button>
              <p className="vc-auth__switch">
                {t("auth.keepProgress")}{" "}
                <button type="button" onClick={() => switchMode("up")}>
                  {t("auth.createLink")}
                </button>
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
