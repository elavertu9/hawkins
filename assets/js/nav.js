// The header's Menu button, on phones. There isn't room for the section links
// (Recipes, Packing, Caffeine) beside Plan and the Cooking pot, so they sit in
// a dropdown under this button. Wider screens show the links and never the button.
//
// Tap Menu to open or close it. Opening moves focus to the first link; Escape
// closes it and puts focus back on the button; tapping anywhere else, or a link,
// closes it. Only one header menu is open at a time: opening this one tells
// cooking.js to close the Cooking menu, and the other way around.
//
// This script runs once per visit (like cooking.js); the header is new on every
// page, so everything listens on the document and looks the menu up each time.
(() => {
  const narrow = matchMedia("(max-width: 52rem)");

  const parts = () => ({
    toggle: document.querySelector("[data-nav-menu-toggle]"),
    menu: document.querySelector("[data-nav-menu]"),
  });

  const setMenu = (open) => {
    const { toggle, menu } = parts();
    if (!toggle || !menu) return;
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      document.dispatchEvent(new CustomEvent("hawkins:menu-open", { detail: "nav" }));
      menu.querySelector("a").focus();
    }
  };

  document.addEventListener("click", (event) => {
    const { toggle, menu } = parts();
    if (!toggle || !menu) return;
    const path = event.composedPath();
    if (path.includes(toggle)) setMenu(menu.hidden);
    else if (!menu.hidden && path.some((el) => el.matches && el.matches("[data-nav-menu] a"))) setMenu(false);
  });
  // Pressing down outside closes it right away (a click would wait for the release).
  document.addEventListener("pointerdown", (event) => {
    const { toggle, menu } = parts();
    if (!menu || menu.hidden) return;
    const path = event.composedPath();
    if (!path.includes(menu) && !path.includes(toggle)) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    const { toggle, menu } = parts();
    if (event.key !== "Escape" || !menu || menu.hidden) return;
    setMenu(false);
    toggle.focus();
  });
  document.addEventListener("hawkins:menu-open", (event) => { if (event.detail !== "nav") setMenu(false); });

  // The header is replaced on a page change, but close it first so a half-open
  // menu is never what the next page starts from. Widening past the phone
  // layout hides the menu, so it shouldn't wait there open.
  document.addEventListener("turbo:before-render", () => setMenu(false));
  narrow.addEventListener("change", () => { if (!narrow.matches) setMenu(false); });
})();
