// Streambert Web Ad Blocker
//
// Browser equivalent of the desktop app's player session setup (index.js):
//   1. BLOCKED_HOSTS requests are cancelled, but only inside Streambert tabs
//      (session rules scoped with tabIds, like the desktop's persist:player).
//   2. New tabs/windows opened from inside the player iframe are closed
//      (desktop: setWindowOpenHandler -> deny). Tabs opened by Streambert's own
//      UI (top frame, e.g. TMDB / GitHub links) are left alone.

// Keep in sync with BLOCKED_HOSTS in the desktop app's index.js
const BLOCKED_HOSTS = [
  "*://www.google-analytics.com/*",
  "*://analytics.google.com/*",
  "*://googletagmanager.com/*",
  "*://www.googletagmanager.com/*",
  "*://googletagservices.com/*",
  "*://doubleclick.net/*",
  "*://*.doubleclick.net/*",
  "*://adservice.google.com/*",
  "*://adservice.google.de/*",
  "*://pagead2.googlesyndication.com/*",
  "*://stats.g.doubleclick.net/*",
  "*://yt3.ggpht.com/ytc/*",
  "*://fonts.googleapis.com/*",
  "*://fonts.gstatic.com/*",
  "*://googleapis.com/*",
  "*://gstatic.com/*",
  "*://cdn.adx1.com/*",
  "*://intelligenceadx.com/*",
  "*://adsco.re/*",
  "*://mc.yandex.com/*",
  "*://mc.yandex.ru/*",
  "*://bvtpk.com/*",
  "*://my.rtmark.net/*",
  "*://b7510.com/*",
  "*://gt.unbrownunflat.com/*",
  "*://im.malocacomals.com/*",
  "*://users.videasy.net/*",
  "*://nf.sixmossin.com/*",
  "*://realizationnewestfangs.com/*",
  "*://acscdn.com/*",
  "*://lt.taloseempest.com/*",
  "*://pl26708123.profitableratecpm.com/*",
  "*://preferencenail.com/*",
  "*://protrafficinspector.com/*",
  "*://s10.histats.com/*",
  "*://weirdopt.com/*",
  "*://static.cloudflareinsights.com/*",
  "*://kettledroopingcontinuation.com/*",
  "*://wayfarerorthodox.com/*",
  "*://woxaglasuy.net/*",
  "*://adeptspiritual.com/*",
  "*://www.calculating-laugh.com/*",
  "*://amavhxdlofklxjg.xyz/*",
  "*://7jtjubf8p5kq7x3z2.u3qleufcm6vure326ktfpbj.cfd/*",
  "*://5mq.get64t9vqg8pnbex1y463o.rest/*",
  "*://usrpubtrk.com/*",
  "*://adexchangeclear.com/*",
  "*://rzjzjnavztycv.online/*",
  "*://tmstr4.cloudnestra.com/*",
  "*://tmstr4.neonhorizonworkshops.com/*",
];

// Electron match pattern -> RE2 regex (same semantics: exact host unless "*.")
const patternToRegex = (pat) => {
  const [, host, path] = pat.match(/^\*:\/\/([^/]+)(\/.*)$/);
  const esc = (s) => s.replace(/[.?+^$()[\]{}|\\]/g, "\\$&");
  const hostRe = host.startsWith("*.")
    ? "([^/]+\\.)?" + esc(host.slice(2))
    : esc(host);
  const pathRe = path
    .split("*")
    .map(esc)
    .join(".*");
  return `^(https?|wss?)://${hostRe}(:\\d+)?${pathRe}`;
};

const RULE_IDS = BLOCKED_HOSTS.map((_, i) => i + 1);

async function getTabs() {
  const { tabs = [] } = await chrome.storage.session.get("tabs");
  return new Set(tabs);
}

async function setTabs(set) {
  await chrome.storage.session.set({ tabs: [...set] });
  const addRules = set.size
    ? BLOCKED_HOSTS.map((pat, i) => ({
        id: RULE_IDS[i],
        priority: 1,
        action: { type: "block" },
        condition: { regexFilter: patternToRegex(pat), tabIds: [...set] },
      }))
    : [];
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: RULE_IDS,
    addRules,
  });
}

// Serialize updates so concurrent messages don't clobber each other
let queue = Promise.resolve();
const update = (fn) =>
  (queue = queue.then(async () => {
    const set = await getTabs();
    if (fn(set) !== false) await setTabs(set);
  }).catch((e) => console.error("[streambert-adblock]", e)));

// detect.js reports every top-level page load: Streambert or not
chrome.runtime.onMessage.addListener((msg, sender) => {
  const id = sender.tab?.id;
  if (id == null || sender.frameId !== 0) return;
  if (msg?.type === "streambert-tab")
    update((set) => (set.has(id) ? false : (set.add(id), true)));
  else if (msg?.type === "other-tab")
    update((set) => (set.delete(id) ? true : false));
});

chrome.tabs.onRemoved.addListener((id) =>
  update((set) => (set.delete(id) ? true : false)),
);

// Pop-ups / pop-unders opened from inside the player iframe
chrome.webNavigation.onCreatedNavigationTarget.addListener(
  async ({ sourceTabId, sourceFrameId, tabId }) => {
    if (sourceFrameId === 0) return; // Streambert's own UI opened it
    const set = await getTabs();
    if (!set.has(sourceTabId)) return;
    chrome.tabs.remove(tabId).catch(() => {});
    const { popupsBlocked = 0 } = await chrome.storage.local.get("popupsBlocked");
    chrome.storage.local.set({ popupsBlocked: popupsBlocked + 1 });
  },
);
