// Easter egg: flips the site into the Upside Down.
// Keyboard: type 011 (Eleven's tattoo). Touch: twist two fingers half a turn,
// like turning the world upside down. (It used to be 4 quick taps on one spot,
// which was too easy to do by accident, like tapping the side of a cook-mode
// step to turn the page.) Do it again to get back. It lasts for the browser session, so the whole
// site stays flipped as you click around. Runs once per visit to the site
// (from <head>; see page.js).
(() => {
  const root = document.documentElement;
  const STORAGE_KEY = "hawkins:upside-down";
  const CODE = "011";
  const TWIST_DEG = 150; // about half a turn: far past what a pinch-zoom turns
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let typed = "";

  const remember = (on) => (on ? HawkinsPage.session.setText(STORAGE_KEY, "1") : HawkinsPage.session.remove(STORAGE_KEY));

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
      ? "You're in the Upside Down. Do it again to get out."
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

  // The twist: the angle of the line between the two fingers, followed as they
  // move and added up, so it can turn either way. A third finger, or lifting
  // one, starts over.
  let twist = null;
  const angleOf = (touches) => {
    const [a, b] = twist.ids.map((id) => [...touches].find((t) => t.identifier === id));
    return a && b ? (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180) / Math.PI : null;
  };
  document.addEventListener("touchstart", (e) => {
    twist = e.touches.length === 2 ? { ids: [e.touches[0].identifier, e.touches[1].identifier], turned: 0 } : null;
    if (twist) twist.last = angleOf(e.touches);
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!twist || e.touches.length !== 2) return;
    const angle = angleOf(e.touches);
    if (angle === null) return (twist = null);
    let step = angle - twist.last;
    if (step > 180) step -= 360; // across the -180/180 line
    if (step < -180) step += 360;
    twist.turned += step;
    twist.last = angle;
    if (Math.abs(twist.turned) >= TWIST_DEG) {
      twist = null;
      toggle();
    }
  }, { passive: true });
  const stop = (e) => { if (e.touches.length < 2) twist = null; };
  document.addEventListener("touchend", stop, { passive: true });
  document.addEventListener("touchcancel", stop, { passive: true });
})();
