// The home-screen app (Add to Home Screen, "Open as Web App"): head.html marks the page .is-app,
// which shows a Back button in the bottom-left corner (up to the list, or home) and makes room for it
// beside the bars and notes at the bottom.
// Headless Chrome isn't a home-screen app, so the tests add .is-app the way head.html would.
import { open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = ev;
const size = (width, height = 844) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 700 });
const asApp = () => q("document.documentElement.classList.add('is-app')");
const where = () => q("location.pathname + location.search");
const back = "document.querySelector('[data-app-back]')";
const box = (sel) => q(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, shown: getComputedStyle(e).display !== 'none' }; })()`);
const tapBack = async () => { await q(`${back}.click()`); await sleep(900); };

await size(390);
// ---------- In Safari: nothing changes ----------
await go("/recipes/");
check("in Safari, no .is-app and no Back", !(await q("document.documentElement.classList.contains('is-app')")) && !(await box("[data-app-back]")).shown);
check("no status bar style: iPhone draws its usual bar", !(await q("!!document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')")));
await go("/");
check("no Back on the home page at all", !(await q(`!!${back}`)));

// ---------- As an app ----------
await go("/cocktails/demogorgon/"); await asApp();
let b = await box("[data-app-back]");
check(`Back shows, bottom left, 48px round: ${JSON.stringify(b)}`, b.shown && b.width === 48 && b.height === 48 && b.left === 16 && Math.round(844 - b.bottom) === 16
  && (await q(`getComputedStyle(${back}).borderRadius`)) === "50%" && (await q(`${back}.getAttribute('aria-label')`)) === "Back");
await tapBack();
check(`from a cocktail opened directly, Back goes to the list: ${await where()}`, (await where()) === "/cocktails/");
check("still an app after the page change (the class stays)", await q("document.documentElement.classList.contains('is-app')"));
await tapBack();
check(`from a list, Back goes home: ${await where()}`, (await where()) === "/");
check("and the home page has no Back", !(await q(`!!${back}`)));
await go("/recipes/?category=dinner"); await asApp(); await sleep(300);
await q("document.querySelector('.card:not([hidden]) .card__link[href=\"/recipes/chicken-marsala/\"]').click()"); await sleep(900);
await tapBack();
check(`from a recipe opened in a filtered list, Back returns to it: ${await where()}`, (await where()) === "/recipes/?category=dinner");

// ---------- Room for it at the bottom ----------
for (const w of [320, 360, 390]) {
  await size(w);
  await go("/recipes/chicken-marsala/"); await asApp(); await sleep(200);
  b = await box("[data-app-back]");
  const bar = await box(".cook-start");
  check(`${w}px: Start cooking starts to the right of Back, same height on screen (${Math.round(b.right)} < ${Math.round(bar.left)})`, b.right + 4 <= bar.left && bar.top < b.bottom && bar.bottom > b.top);
  check(`${w}px: no sideways scroll`, await q("document.documentElement.scrollWidth <= document.documentElement.clientWidth"));
}
await size(390);
await q("document.querySelector('.timer-start') ? document.querySelector('.timer-start').click() : null"); await sleep(400);
const tray = await box("body > .timers");
if (tray && tray.shown) {
  b = await box("[data-app-back]");
  check(`a running timer's tray starts to the right of Back too (${Math.round(b.right)} < ${Math.round(tray.left)})`, b.right + 4 <= tray.left);
}
await q("localStorage.clear()");
await go("/plan/"); await asApp(); await sleep(200);
const toastBottom = await q("parseFloat(getComputedStyle(document.querySelector('.plan-toast')).bottom)");
b = await box("[data-app-back]");
check(`pop-up notes sit above Back (${toastBottom}px from the bottom, Back's top is ${Math.round(844 - b.top)}px)`, toastBottom >= 844 - b.top);
check("the page can scroll clear of Back", (await q("parseFloat(getComputedStyle(document.body).paddingBottom)")) >= 70);

// ---------- Both themes ----------
for (const theme of ["dark", "light"]) {
  await go("/recipes/"); await q(`localStorage.setItem('hawkins:theme', '${theme}')`); await go("/recipes/"); await asApp(); await sleep(200);
  await shot(`app-${theme}`);
}
await q("localStorage.removeItem('hawkins:theme')");

// ---------- Printing ----------
await go("/recipes/chicken-marsala/"); await asApp();
await send("Emulation.setEmulatedMedia", { media: "print" });
check("not printed", !(await box("[data-app-back]")).shown);
await send("Emulation.setEmulatedMedia", { media: "" });

check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
