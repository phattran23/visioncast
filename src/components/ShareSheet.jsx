import { useEffect, useState } from "react";
import { imgUrl } from "../utils/api";
import { useT } from "../utils/i18n";

// Share a title. Links look like https://…/movie/550; the Worker gives those
// URLs the film's artwork, name and synopsis (Open Graph), so Messenger,
// Facebook, Zalo, WhatsApp and Telegram show a picture card.
//
// Phones open the system share sheet (every installed app, Instagram and
// Zalo included). Elsewhere a small sheet offers the apps + copy link.

// The Vercel mirror shares links to the main site, whose Worker builds the
// preview cards
const MAIN_ORIGIN = "https://visioncast.trantienphat-ftu2.workers.dev";

export function shareUrl(item) {
  const type = item.media_type === "tv" ? "tv" : "movie";
  const origin =
    typeof window !== "undefined" &&
    !/\.vercel\.app$/.test(window.location.hostname) &&
    !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
      ? window.location.origin
      : MAIN_ORIGIN;
  return `${origin}/${type}/${item.id}`;
}

const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;

/** Share right away with the system sheet when that's the natural choice. */
export async function shareTitle(item, { openSheet, t }) {
  const url = shareUrl(item);
  const title = item.title || item.name;
  if (navigator.share && isTouch()) {
    try {
      await navigator.share({ title, text: t("share.text", { title }), url });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return; // the viewer closed the sheet
    }
  }
  openSheet();
}

const Ico = ({ children, bg }) => (
  <span className="vc-share__ico" style={{ background: bg }} aria-hidden="true">
    {children}
  </span>
);

export default function ShareSheet({ item, onClose }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const url = shareUrl(item);
  const title = item.title || item.name;
  const text = t("share.text", { title });
  const enc = encodeURIComponent;

  useEffect(() => {
    // Escape closes only this sheet, not the preview underneath
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  const open = (href) => window.open(href, "_blank", "noopener,noreferrer");
  // Apps without a web share URL: copy the link, then open the app/site
  const copyThen = async (href) => {
    await copy();
    open(href);
  };

  const apps = [
    {
      id: "messenger",
      label: "Messenger",
      bg: "linear-gradient(135deg,#00b2ff,#a033ff 60%,#ff5c87)",
      go: () => (isTouch() ? (window.location.href = `fb-messenger://share/?link=${enc(url)}`) : copyThen("https://www.messenger.com/")),
      icon: <path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.3S17 3 12 3zm.9 11.1l-2.3-2.4-4.4 2.4 4.9-5.2 2.3 2.4 4.4-2.4-4.9 5.2z" fill="#fff" />,
    },
    {
      id: "facebook",
      label: "Facebook",
      bg: "#1877f2",
      go: () => open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`),
      icon: <path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21h2.9z" fill="#fff" />,
    },
    {
      id: "zalo",
      label: "Zalo",
      bg: "#0068ff",
      go: () => copyThen("https://chat.zalo.me/"),
      icon: <text x="12" y="15.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">Zalo</text>,
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      bg: "#25d366",
      go: () => open(`https://wa.me/?text=${enc(`${text} ${url}`)}`),
      icon: <path d="M12 3.5a8.4 8.4 0 00-7.2 12.8L3.7 20.5l4.3-1.1A8.4 8.4 0 1012 3.5zm4.6 11.9c-.2.6-1.1 1.1-1.6 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.6s.6-1.9.9-2.1c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.1.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.6-.1 1.2z" fill="#fff" />,
    },
    {
      id: "telegram",
      label: "Telegram",
      bg: "#2aabee",
      go: () => open(`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`),
      icon: <path d="M20.7 4.3L3.6 10.9c-1.2.5-1.1 1.2-.2 1.5l4.4 1.4 1.7 5.2c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.1-2 4.4 3.2c.8.4 1.4.2 1.6-.8l2.9-13.6c.3-1.2-.4-1.7-1.6-1.9zM9.8 14.1l7.7-6.9c.3-.3-.1-.4-.5-.2l-9.5 6 4.1 1.3 3.6-2.5" fill="#fff" />,
    },
    {
      id: "instagram",
      label: "Instagram",
      bg: "radial-gradient(circle at 30% 107%,#fdf497 0%,#fd5949 45%,#d6249f 60%,#285aeb 90%)",
      go: () => copyThen("https://www.instagram.com/direct/inbox/"),
      icon: (
        <>
          <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="16.3" cy="7.7" r="1" fill="#fff" />
        </>
      ),
    },
  ];

  return (
    <div className="nx-modal vc-share-modal" role="dialog" aria-modal="true" aria-label={t("share.title")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vc-share">
        <div className="vc-share__head">
          <h2>{t("share.title")}</h2>
          <button className="vc-share__x" onClick={onClose} aria-label={t("preview.close")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* What the card will look like in chats */}
        <div className="vc-share__card">
          {(item.backdrop_path || item.poster_path) && <img src={imgUrl(item.backdrop_path || item.poster_path, "w780")} alt="" />}
          <div className="vc-share__meta">
            <span className="vc-share__host">{new URL(url).host}</span>
            <b>{title}</b>
            {item.overview && <span className="vc-share__desc">{item.overview}</span>}
          </div>
        </div>

        <div className="vc-share__apps">
          {apps.map((a) => (
            <button key={a.id} className="vc-share__app" onClick={a.go}>
              <Ico bg={a.bg}>
                <svg viewBox="0 0 24 24" width="26" height="26">{a.icon}</svg>
              </Ico>
              <span>{a.label}</span>
            </button>
          ))}
        </div>

        <div className="vc-share__link">
          <input value={url} readOnly onFocus={(e) => e.target.select()} aria-label={t("share.link")} />
          <button className={`vc-share__copy${copied ? " on" : ""}`} onClick={copy}>
            {copied ? t("share.copied") : t("share.copy")}
          </button>
        </div>
        <p className="vc-share__hint">{t("share.hint")}</p>
      </div>
    </div>
  );
}
