// Turbo Drive: links swap pages in place, so the tab (and its timers, sound,
// and listeners) carries over. Checks that nothing doubles up or goes stale.
import { CODE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = (s) => ev(s);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// A real tap (not element.click()), the way Turbo and the browser see a person.
const tap = async (selector) => {
  const box = await q(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error(`nothing to tap: ${selector}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  await sleep(900);
};
const key = async (k) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k }); await sleep(60);
};
const alive = "window.__sameTab === 1";
const path = "location.pathname + location.hash";
const count = "document.querySelector('[data-cook-count]') && document.querySelector('[data-cook-count]').textContent";

await go("/");
await q("localStorage.clear(); sessionStorage.clear()");
await go("/");
await q("window.__sameTab = 1");
check("Turbo is running", await q("!!(window.Turbo && Turbo.session.drive)"));

// Links swap pages in place.
await tap('.site-header a[href="/recipes/"]');
check(`header link -> ${await q(path)}, same tab: ${await q(alive)}`, (await q("location.pathname")) === "/recipes/" && await q(alive));
check(`title updated: ${await q("document.title")}`, /^Recipes/.test(await q("document.title")));
await tap('.card__link[href="/recipes/beef-and-broccoli/"]');
check(`card -> ${await q(path)}, same tab: ${await q(alive)}`, (await q("location.pathname")) === "/recipes/beef-and-broccoli/" && await q(alive));
await q("history.back()"); await sleep(1200);
check(`Back -> ${await q(path)}, same tab: ${await q(alive)}`, (await q("location.pathname")) === "/recipes/" && await q(alive));
await q("history.forward()"); await sleep(1200);
check(`Forward -> ${await q(path)}`, (await q("location.pathname")) === "/recipes/beef-and-broccoli/" && await q(alive));

// Filters on the list page keep the URL, and Back still works after them.
await tap('.site-header a[href="/recipes/"]');
await tap('.chip[data-category="dessert"]');
check(`filter in URL: ${await q("location.search")}`, (await q("location.search")).includes("category=dessert"));
await tap(".card:not([hidden]) .card__link");
const dessert = await q("location.pathname");
await q("history.back()"); await sleep(1200);
check(`Back to filtered list: ${await q("location.search")}, ${await q("document.querySelectorAll('.card:not([hidden])').length")} showing`,
  (await q("location.search")).includes("category=dessert") && await q("document.querySelectorAll('.card:not([hidden])').length < document.querySelectorAll('.card').length") && await q(alive));

// A timer started in cook mode carries across pages, and sound stays unlocked.
await go("/recipes/cannoli-dip/");
await q("window.__sameTab = 1");
await tap("[data-cook]");
await tap(".cook__seg:nth-child(2)");
check(`cook mode at ${await q(count)}`, (await q(count)) === "Step 2 of 4");
await tap(".cook .timer-start");
check("timer running", await q("document.querySelectorAll('.timer').length === 1"));
const soundHidden = await q("document.querySelector('.timers__sound').hidden");
await tap("[data-cook-close]");
await tap('.site-header a[href="/plan/"]');
check(`on ${await q(path)}: one tray, one timer, same tab`, (await q("location.pathname")) === "/plan/" && await q("document.querySelectorAll('.timers').length === 1 && document.querySelectorAll('.timer').length === 1") && await q(alive));
check(`sound still unlocked after moving page (was hidden: ${soundHidden})`, (await q("document.querySelector('.timers__sound').hidden")) === soundHidden);
await tap('.site-header a[href="/recipes/"]');
await tap('.card__link[href="/recipes/banana-bread/"]');
check(`still one timer on ${await q(path)}`, await q("document.querySelectorAll('.timers').length === 1 && document.querySelectorAll('.timer').length === 1"));
await shot("turbo-timer-other-recipe");

// Tapping the timer goes back to its step, in place.
await tap(".timer__open");
check(`timer -> ${await q(path)} at ${await q(count)}, same tab: ${await q(alive)}`,
  (await q("location.pathname")) === "/recipes/cannoli-dip/" && await q("document.querySelector('.cook').open") && (await q(count)) === "Step 2 of 4" && await q(alive));

// Finish it; Continue recipe from another page.
await tap("[data-cook-close]");
await tap('.site-header a[href="/recipes/"]');
await q("(() => { const real = Date.now.bind(Date); Date.now = () => real() + 31 * 1000; })()"); await sleep(600);
check("timer finished on the list page", await q("document.querySelector('.timer').classList.contains('is-done')"));
await tap(".timer__continue");
check(`Continue recipe -> ${await q(path)} at ${await q(count)}, timer cleared`,
  (await q("location.pathname")) === "/recipes/cannoli-dip/" && (await q(count)) === "Step 2 of 4" && await q("!document.querySelector('.timer')") && await q(alive));
await tap("[data-cook-close]");
check(`closing leaves a clean URL: ${await q(path)}`, (await q(path)) === "/recipes/cannoli-dip/");

// Cook mode's own Back handling, after Turbo visits.
await tap("[data-cook]");
check(`reopen asks to pick up at step 2: ${await q("document.querySelector('[data-cook-resume-title]').textContent")}`, (await q("document.querySelector('[data-cook-resume-title]').textContent")) === "Pick up at step 2?");
await tap("[data-cook-resume-continue]");
check(`cook open, hash ${await q("location.hash")}`, (await q("location.hash")) === "#cook");
await q("history.back()"); await sleep(800);
check(`Back closes cook mode once: open=${await q("document.querySelector('.cook').open")} at ${await q(path)}`,
  !(await q("document.querySelector('.cook').open")) && (await q(path)) === "/recipes/cannoli-dip/" && await q(alive));
check("page scrolls again after cook mode", await q("!document.documentElement.classList.contains('is-cooking')"));
await q("history.back()"); await sleep(1200);
check(`Back again leaves the recipe: ${await q(path)}`, (await q("location.pathname")) !== "/recipes/cannoli-dip/");

// Leaving with cook mode open doesn't leave the page stuck.
await go("/recipes/zuppa-toscana/#cook");
await q("window.__sameTab = 1");
check("deep link opens cook mode", await q("document.querySelector('.cook').open"));
await q("HawkinsPage.visit('/recipes/')"); await sleep(1200);
check(`left from cook mode -> ${await q(path)}: page scrolls, no dialog`, (await q("location.pathname")) === "/recipes/" && await q("!document.documentElement.classList.contains('is-cooking') && !document.querySelector('.cook')"));

// Scripts that run on every page don't double up.
await go("/");
await q("window.__sameTab = 1");
for (const p of ["/recipes/", "/plan/", "/", "/recipes/"]) { await q(`HawkinsPage.visit('${p}')`); await sleep(1000); }
await tap('.card__link[href="/recipes/goulash/"]');
await tap(".site-header .plan-link");
await q("history.back()"); await sleep(1200);
await tap("[data-plan-add]");
check(`+ Plan adds once after many visits: ${await q("JSON.parse(localStorage.getItem('hawkins:plan')).recipes.length")}`,
  (await q("JSON.parse(localStorage.getItem('hawkins:plan')).recipes.length")) === 1);
for (const k of "011") await key(k);
await sleep(1200);
check("Upside Down flips once (not twice) after many visits", await q("document.documentElement.classList.contains('upside-down')"));
await tap('.site-header a[href="/recipes/"]');
check(`stays flipped across pages: ${await q(path)}`, await q("document.documentElement.classList.contains('upside-down')") && await q(alive));
check("toast follows to the new page", await q("(() => { const t = document.querySelector('.upside-toast'); return !t || t.isConnected; })()"));
for (const k of "011") await key(k);
await sleep(1200);
check("flips back", await q("!document.documentElement.classList.contains('upside-down')"));
await q("HawkinsPage.visit('/')"); await sleep(1500);
check(`home lights: one wall of bulbs (${await q("document.querySelectorAll('.bulb').length")})`, (await q("document.querySelectorAll('[data-lights] > *').length")) === (await q("document.querySelector('[data-lights]').dataset.lights.length")));

// A classified recipe opened by a link (not a full load) still unlocks and
// gets cook mode. Skipped without the gitignored code file.
if (CODE) {
  await q(`localStorage.setItem("hawkins:clearance-code", ${JSON.stringify(CODE)})`);
  await q("HawkinsPage.visit('/recipes/')"); await sleep(1200);
  await tap('.card__link[href="/recipes/lobster-bisque/"]'); await sleep(1500);
  check(`classified via link: unlocked=${await q("!document.querySelector('[data-classified]')")}, cook button=${await q("!!document.querySelector('[data-cook]:not([hidden])')")}`,
    await q("!document.querySelector('[data-classified]') && !!document.querySelector('[data-cook]:not([hidden])')") && await q(alive));
  await q('localStorage.removeItem("hawkins:clearance-code")');
} else {
  console.log("skip classified via link (no .classified-code)");
}

check(`same tab the whole time: ${await q(alive)}`, await q(alive));
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
