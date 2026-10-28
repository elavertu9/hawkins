// Easter egg: flips the site into the Upside Down.
// Keyboard: type 011 (Eleven's tattoo). Touch: triple-tap a blank spot.
// Do it again to get back. It lasts for the browser session, so the whole
// site stays flipped as you click around. Runs once per visit to the site
// (from <head>; see page.js).
(() => {
  const root = document.documentElement;
  const STORAGE_KEY = "hawkins:upside-down";
  const CODE = "011";
  const TAPS = 3;
  const TAP_GAP_MS = 450; // max time between taps
  const TAP_SLOP_PX = 30; // max finger movement for a tap
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let typed = "";

  const remember = (on) => {
    try {
      if (on) sessionStorage.setItem(STORAGE_KEY, "1");
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* storage unavailable */ }
  };

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

  let toast;
  let hideTimer;
  const announce = (text) => {
    if (!toast) {
      toast = document.createElement("p");
      toast.className = "upside-toast";
      toast.setAttribute("role", "status");
    }
    if (!toast.isConnected) document.body.appendChild(toast); // a new page swapped in
    toast.textContent = text;
    toast.classList.remove("is-shown");
    void toast.offsetWidth; // restart the animation
    toast.classList.add("is-shown");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toast.classList.remove("is-shown"), 4500);
  };

  const flip = () => {
    // Keep the same content on screen: mirror the scroll position.
    const y = window.scrollY;
    const on = root.classList.toggle("upside-down");
    window.scrollTo({ top: Math.max(0, maxScroll() - y), behavior: "instant" });
    remember(on);
    announce(on
      ? "You're in the Upside Down. Enter the code again to get out."
      : "You made it back. Friends don't lie.");
  };

  const toggle = () => {
    if (reduceMotion) return flip();
    root.classList.add("upside-flicker");
    setTimeout(flip, 450);
    setTimeout(() => root.classList.remove("upside-flicker"), 900);
  };

  // A flipped page starts at the bottom, where the header now is.
  const startAtHeader = () => {
    const nav = performance.getEntriesByType("navigation")[0];
    if (location.hash || (nav && nav.type === "back_forward")) return;
    window.scrollTo({ top: maxScroll(), behavior: "instant" });
  };
  if (root.classList.contains("upside-down")) {
    startAtHeader();
    window.addEventListener("load", startAtHeader, { once: true });
  }
  // The same after Turbo swaps in a new page from a link (Back and Forward
  // restore where you were instead).
  let lastAction = null;
  document.addEventListener("turbo:visit", (e) => { lastAction = e.detail.action; });
  document.addEventListener("turbo:load", () => {
    if (lastAction !== "advance" || location.hash || !root.classList.contains("upside-down")) return;
    window.scrollTo({ top: maxScroll(), behavior: "instant" });
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    typed = (typed + e.key).slice(-CODE.length);
    if (typed === CODE) {
      typed = "";
      toggle();
    }
  });

  let start = null;
  let taps = 0;
  let lastTap = 0;
  document.addEventListener("touchstart", (e) => {
    start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!start) return;
    const moved = Math.hypot(e.changedTouches[0].clientX - start.x, e.changedTouches[0].clientY - start.y);
    start = null;
    // Scrolls, and taps on links and buttons, reset the count.
    if (moved > TAP_SLOP_PX || e.target.closest("a, button, label, input")) return (taps = 0);
    const now = Date.now();
    taps = now - lastTap < TAP_GAP_MS ? taps + 1 : 1;
    lastTap = now;
    if (taps === TAPS) {
      taps = 0;
      toggle();
    }
  }, { passive: true });
})();
