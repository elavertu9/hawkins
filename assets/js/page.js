// Page lifecycle with Turbo Drive (lib/turbo.js).
//
// Turbo turns links into in-place page swaps: the browser tab stays loaded, so
// timers keep beeping and the screen keeps its wake lock as you move around.
// The flip side is that scripts in a page's <body> run again on every visit,
// while the window and document stay the same. So page scripts add window and
// document listeners through HawkinsPage.on, and anything else that needs
// undoing through HawkinsPage.onLeave; both are cleaned up before the next page
// renders. Scripts in <head> (this one, timers.js, upside-down.js) run once.
(() => {
  let cleanups = [];

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
  };

  document.addEventListener("turbo:before-render", () => {
    const fns = cleanups;
    cleanups = [];
    fns.forEach((fn) => {
      try { fn(); } catch (error) { console.error(error); }
    });
  });
})();
