# VisionCast

VisionCast (formerly Streambert Web) is the browser version of the
[Streambert](../streambert) desktop app, redesigned in the **Halo** style (glass & ambient light) for desktop and mobile web. It is the
same React app built with Vite, with the Electron layer removed, so it runs in
any modern browser and can be hosted as a static site.

Design: glass pill navigation (top on desktop, floating tab bar on phones), a
cross-fading hero with an ambient glow, "Up next" landscape cards and poster
rails. Styles live in `src/styles/halo.css` on top of `global.css`; Halo is the
default theme/accent and the other themes in Settings → Appearance still work.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static site in dist/
npm run preview   # serve the built dist/
```

`dist/` uses relative paths (`base: "./"`), so it can be dropped onto any
static host (GitHub Pages, Netlify, Cloudflare Pages, nginx, …).

On first launch, paste your TMDB Read Access Token (see
[tmdb-tutorial.md](tmdb-tutorial.md)). In the browser it is stored in
`localStorage`, not in the OS keychain like the desktop app.

## Differences from the desktop app

| Feature | Web |
| --- | --- |
| Browse, search, library, history, watchlist, settings, backups | ✅ same |
| Player (VidSrc only) | ✅ via `<iframe>` (`src/components/PlayerFrame.jsx`) |
| Continue-watching progress | ✅ from the players' `postMessage` events instead of script injection |
| Trailers | ✅ YouTube privacy-enhanced embed (Invidious can't be framed/scripted) |
| Ad / popup blocking | ✅ with the companion extension in [`extension/`](extension) (see below) |
| Downloads, subtitle downloads, Downloads page | ❌ needs the filesystem + yt-dlp |
| AllManga anime source | ❌ resolver runs in the Electron main process |
| Pop-out player, Discord RPC, desktop notifications, auto-update, window controls | ❌ desktop only |
| Seek correction / intro skip / in-player controller script | ❌ cross-origin frames can't be scripted |

## Ad blocker extension

A web page can't block requests or pop-ups coming from the player iframe, so
the desktop app's ad blocking ships as a small Chrome/Edge extension in
[`extension/`](extension). It does the same two things as the desktop app:

- blocks the desktop app's ad/tracker host list (`BLOCKED_HOSTS` in
  `extension/background.js`, keep it in sync with the desktop `index.js`), but
  only in tabs running Streambert Web
- closes any tab or window the player iframe opens (pop-ups / pop-unders);
  links opened by Streambert's own UI are not affected

Streambert tabs are recognised by the `<meta name="streambert-web">` tag in
`index.html`, so it works on localhost and on any host you deploy to.

Install (Chrome, Edge, Brave, Opera):

1. Open `chrome://extensions` (or `edge://extensions`)
2. Turn on **Developer mode**
3. Click **Load unpacked** and pick the `extension` folder
4. Reload Streambert Web

Not supported in Firefox without packaging and signing the extension.

## Deploy (Cloudflare)

Live at https://visioncast.trantienphat-ftu2.workers.dev, served by Cloudflare
Workers static assets (`wrangler.jsonc` → `dist/`). To publish a new version:

```bash
npx wrangler login     # once
npm run deploy         # builds (needs .env with VITE_TMDB_TOKEN) and uploads
```

`.env` is not committed. The token is embedded in the built JavaScript, so
anyone visiting the site can read it.
