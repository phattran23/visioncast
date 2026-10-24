import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useT } from "../utils/i18n";

// Browser stand-in for Electron's <webview> tag.
//
// Renders a plain, unsandboxed <iframe> (the embed providers refuse to run in
// a sandboxed frame) but exposes the subset of the webview API the pages
// use, so MoviePage / TVPage / TrailerModal keep working unchanged:
//   - executeJavaScript(code): cross-origin frames can't be scripted, so this
//     resolves null, except for the "where is the video?" queries, which are
//     answered from the progress events the embed providers postMessage to us.
//   - getWebContentsId(): always null (no WebContents in a browser).
//   - "dom-ready" / "did-finish-load" events: re-dispatched from iframe "load".
//
// Players post progress in different shapes (all times in seconds):
//   VidSrc:  { type: "PLAYER_EVENT", data: { player_status, player_progress, player_duration } }
//   Videasy: { type: "MEDIA_DATA", data: '{"movie-550":{"progress":{"watched","duration"}}}' }
//   Vidking: { type: "PLAYER_EVENT", data: { event, currentTime, duration } }

const STALE_MS = 15000;
// After the viewer first taps into the player, how long we wait for playback
// to start before offering another source
const STUCK_MS = 15000;

const toJson = (v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

function parseProgress(raw) {
  const msg = toJson(raw);
  if (!msg || typeof msg !== "object") return null;
  const data = toJson(msg.data);
  let currentTime, duration, event;

  if (msg.type === "MEDIA_DATA" && data && typeof data === "object") {
    // Videasy: map of "<type>-<id>[-s-e]" -> entry; take the most recently updated
    const entries = Object.values(data).filter((e) => e?.progress);
    const e = entries.sort(
      (a, b) => (b.last_updated ?? 0) - (a.last_updated ?? 0),
    )[0];
    if (!e) return null;
    currentTime = Number(e.progress.watched);
    duration = Number(e.progress.duration);
    // Before playback starts Videasy reports the TMDB runtime with watched=0
    if (!(currentTime > 0)) return null;
  } else {
    const d = data && typeof data === "object" ? data : msg;
    currentTime = Number(
      d.player_progress ?? d.currentTime ?? d.timestamp ?? d.time,
    );
    duration = Number(d.player_duration ?? d.duration);
    event = d.player_status ?? d.event ?? msg.event ?? null;
  }

  if (!isFinite(currentTime) || !isFinite(duration) || duration <= 0)
    return null;
  return { currentTime, duration, event };
}

const PlayerFrame = forwardRef(function PlayerFrame(
  {
    src,
    style,
    title = "Player",
    // "Not playing?" prompt: shown when the viewer tapped into the player but
    // no playback started (e.g. the source needs an ad pop-up the browser
    // blocked). Only for sources that report progress (watchStuck).
    watchStuck = false,
    nextSourceLabel,
    onNextSource,
  },
  ref,
) {
  const t = useT();
  const frameRef = useRef(null);
  const progressRef = useRef(null);
  const progressedRef = useRef(false);
  const stuckTimer = useRef(null);
  const [stuck, setStuck] = useState(false);

  useImperativeHandle(ref, () => frameRef.current, []);

  // Collect progress events coming from this frame only
  useEffect(() => {
    const onMessage = (e) => {
      const frame = frameRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const p = parseProgress(e.data);
      if (!p) return;
      if (p.currentTime > 0.5 && !progressedRef.current) {
        progressedRef.current = true;
        clearTimeout(stuckTimer.current);
        stuckTimer.current = null;
        setStuck(false);
      }
      const prev = progressRef.current;
      const paused =
        p.event === "pause" ||
        p.event === "paused" ||
        p.event === "ended" ||
        (p.event == null && prev?.currentTime === p.currentTime);
      progressRef.current = { ...p, paused, at: Date.now() };
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Reset progress whenever the source changes
  useEffect(() => {
    progressRef.current = null;
    progressedRef.current = false;
    clearTimeout(stuckTimer.current);
    stuckTimer.current = null;
    setStuck(false);
  }, [src]);

  // Tapping/clicking into the cross-origin player moves focus into the
  // iframe (the window blurs): start the "did playback begin?" timer then
  useEffect(() => {
    if (!watchStuck || !onNextSource) return;
    const onBlur = () => {
      setTimeout(() => {
        if (document.activeElement !== frameRef.current) return;
        if (progressedRef.current || stuckTimer.current) return;
        stuckTimer.current = setTimeout(() => {
          stuckTimer.current = null;
          if (!progressedRef.current) setStuck(true);
        }, STUCK_MS);
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      clearTimeout(stuckTimer.current);
      stuckTimer.current = null;
    };
  }, [watchStuck, onNextSource, src]);

  // Attach the webview-compatible methods + event forwarding to the node
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    frame.getWebContentsId = () => null;
    frame.executeJavaScript = (code = "") => {
      const p = progressRef.current;
      const fresh = p && Date.now() - p.at < STALE_MS;
      if (!fresh) return Promise.resolve(null);
      // Duration-only query (TVPage intro/outro detection)
      if (/return \(v && v\.duration > 0/.test(code))
        return Promise.resolve(p.duration);
      // Progress query used for auto-tracking
      if (code.includes("currentTime: v.currentTime")) {
        if (p.paused) return Promise.resolve(null);
        return Promise.resolve({
          currentTime: p.currentTime,
          duration: p.duration,
          recentUserSeek: false,
          lastUserSeekTo: null,
        });
      }
      return Promise.resolve(null);
    };

    const onLoad = () => {
      frame.dispatchEvent(new Event("dom-ready"));
      frame.dispatchEvent(new Event("did-finish-load"));
    };
    frame.addEventListener("load", onLoad);
    return () => frame.removeEventListener("load", onLoad);
  }, []);

  return (
    <>
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        style={style}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="origin"
      />
      {stuck && onNextSource && (
        <div className="vc-stuck" role="status">
          <span className="vc-stuck__text">{t("player.stuck")}</span>
          <button type="button" className="vc-stuck__primary" onClick={onNextSource}>
            {t("player.tryNext", { name: nextSourceLabel })}
          </button>
          <button
            type="button"
            className="vc-stuck__secondary"
            onClick={() => window.open(src, "_blank", "noopener")}
          >
            {t("player.openSeparate")}
          </button>
          <button
            type="button"
            className="vc-stuck__close"
            onClick={() => setStuck(false)}
            aria-label={t("player.dismiss")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
});

export default PlayerFrame;
