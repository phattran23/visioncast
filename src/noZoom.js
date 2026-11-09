// Keeps the page at its own size on phones, as an installed app does.
// The viewport tag stops Android from zooming and iOS from zooming into a search box,
// `touch-action: manipulation` in styles.css stops double-tap zoom, and this stops the
// pinch that iOS Safari still allows whatever the viewport tag says.
export function preventZoom() {
  const stop = (event) => event.preventDefault()
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, stop, { passive: false })
  }
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) event.preventDefault()
  }, { passive: false })
}
