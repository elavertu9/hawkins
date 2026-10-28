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
    store: storage("localStorage"),
    session: storage("sessionStorage"),
    wake,
  };

  document.addEventListener("turbo:before-render", () => {
    const fns = cleanups;
    cleanups = [];
    fns.forEach((fn) => {
      try { fn(); } catch (error) { console.error(error); }
    });
  });
})();
