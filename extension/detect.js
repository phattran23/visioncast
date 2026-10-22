// Runs in every top-level page. Streambert Web marks itself with
// <meta name="streambert-web">; the background worker scopes the ad-blocking
// rules to tabs that report "streambert-tab" and drops tabs that navigate
// anywhere else.
(() => {
  const report = () => {
    const isStreambert = !!document.querySelector('meta[name="streambert-web"]');
    chrome.runtime.sendMessage({
      type: isStreambert ? "streambert-tab" : "other-tab",
    });
    if (isStreambert) document.documentElement.dataset.streambertAdblock = "1";
  };
  // At document_start the <head> isn't parsed yet
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", report, { once: true });
  else report();
})();
