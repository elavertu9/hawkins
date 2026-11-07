// Page lifecycle with Turbo Drive (lib/turbo.min.js), plus small helpers every
// page script shares.
//
// Turbo turns links into in-place page swaps: the browser tab stays loaded, so
// timers keep beeping and the screen keeps its wake lock as you move around.
// The flip side is that scripts in a page's <body> run again on every visit,
// while the window and document stay the same. So page scripts add window and
// document listeners through HawkinsPage.on, and anything else that needs
// undoing through HawkinsPage.onLeave; both are cleaned up before the next page
// renders. Scripts in <head> (this one, timers.js, upside-down.js) run once.
//
// HawkinsPage.store / .session: localStorage / sessionStorage that never throw
// (private browsing, blocked storage, corrupt data). get/set store JSON;
// getText/setText store plain strings.
//
// HawkinsPage.favorites: the recipes you've hearted, saved in this browser
// (no expiry). Cards for them get .is-favorite on every page.
//
// Appearance: Auto (the device's setting), Light, or Dark, picked at the
// bottom of every page and remembered in this browser. head.html applies it
// before the page draws.
//
// HawkinsPage.clearance: the clearance code for classified recipes, saved on
// this device once it works. open(cipher) decrypts something locked with it
// (see scripts/classified.rb), or gives null. forget() locks every classified
// file again and fires "hawkins:locked" on document (plan.js drops them from
// the meal plan).
//
// HawkinsPage.wake: keeps the screen on (Screen Wake Lock API) while anything
// asks for it. Each part of the site asks under its own name (cook mode, the
// Keep screen on button, running timers), and the screen can sleep again once
// none of them do.
(() => {
  let cleanups = [];

  const storage = (name) => {
    const area = () => window[name]; // reading it can throw when storage is blocked
    return {
      get(key, fallback = null) {
        try {
          const value = area().getItem(key);
          return value === null ? fallback : JSON.parse(value);
        } catch (_) { return fallback; }
      },
      set(key, value) {
        try { area().setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ }
      },
      getText(key) {
        try { return area().getItem(key); } catch (_) { return null; }
      },
      setText(key, value) {
        try { area().setItem(key, value); } catch (_) { /* ignore */ }
      },
      remove(key) {
        try { area().removeItem(key); } catch (_) { /* ignore */ }
      },
    };
  };

  const store = storage("localStorage");
  const session = storage("sessionStorage");

  (() => {
    const KEY = "hawkins:theme";
    const metaColor = (theme) => document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (!m.dataset.color) m.dataset.color = m.content;
      m.content = theme === "light" ? "#f3ede1" : theme === "dark" ? "#060608" : m.dataset.color;
    });
    const apply = () => {
      const theme = store.getText(KEY) || "";
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
      metaColor(theme);
      document.querySelectorAll("[data-theme-pick]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themePick === theme)));
    };
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme-pick]");
      if (!button) return;
      if (button.dataset.themePick) store.setText(KEY, button.dataset.themePick); else store.remove(KEY);
      apply();
    });
    document.addEventListener("turbo:load", apply);
    document.addEventListener("DOMContentLoaded", apply);
  })();

  const wake = (() => {
    const supported = "wakeLock" in navigator;
    const wanted = new Set();
    const listeners = new Set();
    let lock = null;
    let pending = null;
    const notify = () => listeners.forEach((fn) => fn());

    const sync = async () => {
      if (!supported) return;
      if (pending) await pending;
      // The browser drops the lock while the tab is hidden; we take it back on return.
      if (wanted.size && !lock && document.visibilityState === "visible") {
        pending = navigator.wakeLock.request("screen").then((l) => {
          lock = l;
          l.addEventListener("release", () => { lock = null; notify(); });
        }, () => { lock = null; });
        await pending;
        pending = null;
        if (!wanted.size && lock) await lock.release();
      } else if (!wanted.size && lock) {
        await lock.release();
      }
      notify();
    };
    document.addEventListener("visibilitychange", sync);

    return {
      supported,
      // Ask for the screen to stay on (or stop asking). Resolves once settled;
      // active() then says whether it worked.
      set(name, on) {
        if (on) wanted.add(name); else wanted.delete(name);
        return sync();
      },
      active: () => lock !== null,
      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
  })();

  const favorites = (() => {
    const KEY = "hawkins:favorites";
    const list = () => {
      const saved = store.get(KEY, []);
      return Array.isArray(saved) ? saved.filter((s) => typeof s === "string") : [];
    };
    const mark = () => {
      const slugs = new Set(list());
      document.querySelectorAll(".card[data-slug]").forEach((card) => {
        card.classList.toggle("is-favorite", slugs.has(card.dataset.slug));
      });
    };
    document.addEventListener("turbo:load", mark);
    document.addEventListener("DOMContentLoaded", mark);
    return {
      list,
      has: (slug) => list().includes(slug),
      set(slug, on) {
        const rest = list().filter((s) => s !== slug);
        store.set(KEY, on ? [...rest, slug] : rest);
        mark();
      },
    };
  })();

  const clearance = (() => {
    const KEY = "hawkins:clearance-code";
    // Codes ignore case and extra spaces, so "Friends  Don't Lie" works too.
    // Must match normalize in scripts/classified.rb.
    const normalize = (code) => code.trim().replace(/\s+/g, " ").toLowerCase();
    const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    // AES-GCM, with the key from PBKDF2-SHA256. Throws on the wrong code.
    const decrypt = async (cipher, code) => {
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalize(code)), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: bytes(cipher.salt), iterations: cipher.iterations, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(cipher.iv) }, key, bytes(cipher.data));
      return new TextDecoder().decode(plain);
    };
    const code = () => store.getText(KEY);
    return {
      code,
      remember: (value) => store.setText(KEY, value),
      forget() {
        store.remove(KEY);
        document.dispatchEvent(new CustomEvent("hawkins:locked"));
      },
      decrypt,
      async open(cipher) {
        const saved = code();
        if (!saved || !cipher || !window.crypto || !crypto.subtle) return null;
        try { return await decrypt(cipher, saved); } catch (_) { return null; }
      },
    };
  })();

  window.HawkinsPage = {
    on(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      cleanups.push(() => target.removeEventListener(type, listener, options));
    },
    onLeave(fn) { cleanups.push(fn); },
    // Go to another page on the site, in place when Turbo is running.
    visit(url) {
      if (window.Turbo && Turbo.session.drive) Turbo.visit(url);
      else location.href = url;
    },
    // history.replaceState that keeps Turbo's entry data, so Back still works.
    replaceUrl(url) { history.replaceState(history.state, "", url); },
    store,
    session,
    favorites,
    clearance,
    wake,
  };

  // Page transitions: pages fade into each other, and the recipe card you
  // tap (or come back to) shares its photo and title with the recipe page so
  // they glide between the two. Skipped with reduced motion, while a dialog
  // like cook mode is open, or when the tab is in the background, where the
  // browser can't take its snapshot.
  const CARD_KEY = "hawkins:transition-card";
  const nameCard = (card) => {
    const media = card && card.querySelector(".card__media");
    if (!media) return;
    media.style.viewTransitionName = "recipe-media";
    card.querySelector(".card__title").style.viewTransitionName = "recipe-title";
  };
  document.addEventListener("click", (event) => {
    const card = event.target.closest(".card");
    if (!card || !event.target.closest(".card__link")) return;
    nameCard(card);
    session.setText(CARD_KEY, card.dataset.slug);
  }, true);
  document.addEventListener("turbo:before-render", (event) => {
    if (!document.startViewTransition || document.visibilityState !== "visible"
      || document.querySelector("dialog[open]") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const slug = session.getText(CARD_KEY);
    if (slug) nameCard(event.detail.newBody.querySelector(`.card[data-slug="${CSS.escape(slug)}"]`));
    const render = event.detail.render;
    event.detail.render = (current, next) => {
      const transition = document.startViewTransition(() => render(current, next));
      transition.ready.catch(() => {}); // a skipped transition still swaps the page
      return transition.updateCallbackDone;
    };
  });

  // Esc on a recipe or cocktail page goes to its list (the breadcrumb's first
  // link). Back, when you came from that list, so its filters and scroll come
  // back too. Not while Esc means something else: cook mode or another dialog,
  // the Menu or Cooking dropdown, or typing in a box.
  const sitePath = (url) => {
    try { const u = new URL(url); return u.origin === location.origin ? u.pathname : null; } catch (_) { return null; }
  };
  let previousPath = sitePath(document.referrer);
  let currentPath = location.pathname;
  document.addEventListener("turbo:load", () => {
    if (location.pathname !== currentPath) { previousPath = currentPath; currentPath = location.pathname; }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const list = document.querySelector(".breadcrumb a");
    if (!list || document.querySelector("dialog[open], [data-nav-menu]:not([hidden]), [data-cooking-menu]:not([hidden])")) return;
    if (event.target.closest && event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    if (previousPath === new URL(list.href).pathname && !location.hash) history.back();
    else HawkinsPage.visit(list.href);
  });

  document.addEventListener("turbo:before-render", () => {
    const fns = cleanups;
    cleanups = [];
    fns.forEach((fn) => {
      try { fn(); } catch (error) { console.error(error); }
    });
  });
})();
