// The recipe page: Start cooking, the servings control, favorites (and the
// Favorites filter they feed), quiet placeholders, page transitions, and the
// light theme.
import { open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = (s) => ev(s);
const amounts = "[...document.querySelectorAll('.ingredients .qty')].slice(0, 3).map(e => e.textContent).join(' | ')";
const tap = async (selector) => {
  const box = await q(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error(`nothing to tap: ${selector}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  await sleep(300);
};

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go("/recipes/banana-bread/");
await q("localStorage.clear()"); await go("/recipes/banana-bread/");

// One primary action, waiting at the bottom of the screen on a phone.
const cook = "document.querySelector('[data-cook]')";
check(`Start cooking: "${await q(cook + ".textContent.trim()")}", pinned to the bottom`,
  (await q(cook + ".textContent.trim()")) === "Start cooking" && await q(`getComputedStyle(${cook}).position === 'fixed' && ${cook}.getBoundingClientRect().bottom > innerHeight - 40`));
await shot("recipe-mobile");
await tap("[data-cook]");
check("it opens cook mode", await q("document.querySelector('.cook').open"));
await q("document.querySelector('[data-cook-close]').click()"); await sleep(300);

// Servings: amounts follow, the steps keep theirs, and it's remembered.
const before = await q(amounts);
const serves = "document.querySelector('[data-servings-value]').textContent";
await q("document.querySelector('[data-servings-step=\"1\"]').click()");
check(`+ -> serves ${await q(serves)}: ${await q(amounts)} (was ${before})`, (await q(serves)) !== (await q("document.querySelector('[data-servings]').dataset.servings")) && (await q(amounts)) !== before);
check(`hero says ${await q("document.querySelector('[data-serves-stat]').textContent")}, note shown`, (await q("document.querySelector('[data-serves-stat]').textContent")) === (await q(serves)) && !(await q("document.querySelector('[data-servings-note]').hidden")));
check("cook mode's list scaled too", await q("document.querySelector('.cook .qty').textContent === document.querySelector('.ingredients .qty').textContent"));
await go("/recipes/banana-bread/");
check(`kept after reload: serves ${await q(serves)}`, (await q(amounts)) !== before);
await q("document.querySelector('[data-servings-step=\"-1\"]').click()");
check(`- -> back to ${await q(amounts)}`, (await q(amounts)) === before && await q("document.querySelector('[data-servings-note]').hidden"));
for (let i = 0; i < 3; i++) await q("document.querySelector('[data-servings-step=\"-1\"]').click()");
check("smallest is half, then - is off", await q("document.querySelector('[data-servings-step=\"-1\"]').disabled"));
await q("document.querySelector('[data-servings-step=\"1\"]').click()");

// Favorites: a heart on the page, a badge on the card, and a filter.
await q("document.querySelector('[data-fave]').click()");
check("favorite pressed", (await q("document.querySelector('[data-fave]').getAttribute('aria-pressed')")) === "true");
await go("/recipes/");
check("its card shows a heart", await q("document.querySelector('.card[data-slug=\"banana-bread\"]').classList.contains('is-favorite') && getComputedStyle(document.querySelector('.card[data-slug=\"banana-bread\"] .card__fave')).display !== 'none'"));
await tap("#recipe-search");
check(`Favorites offered: ${await q("[...document.querySelectorAll('.suggest .chip:not([hidden])')].slice(0, 2).map(c => c.dataset.label)")}`, await q("!document.querySelector('.suggest [data-fav]').hidden"));
await tap(".suggest [data-fav]");
check(`Favorites -> ${await q("location.search")}: ${await q("[...document.querySelectorAll('.card:not([hidden])')].map(c => c.dataset.slug)")}`,
  (await q("location.search")) === "?favorites=1" && (await q("[...document.querySelectorAll('.card:not([hidden])')].map(c => c.dataset.slug).join()")) === "banana-bread");
await shot("favorites-mobile");
await go("/recipes/banana-bread/");
await q("document.querySelector('[data-fave]').click()");
await go("/recipes/?favorites=1");
check("unfavorited: the filter lets go", (await q("document.querySelectorAll('.card:not([hidden])').length")) === (await q("document.querySelectorAll('.card').length")));

// Cards without a photo get a quiet tile, not the Missing poster.
check(`placeholder tiles: ${await q("document.querySelectorAll('.card__placeholder').length")}, no poster images on cards`,
  (await q("document.querySelectorAll('.card__placeholder').length")) > 0 && await q("![...document.querySelectorAll('.card img')].some(i => /placeholder|missing/i.test(i.src))"));
check(`Surprise me: "${await q("document.querySelector('[data-random]').textContent")}"`, (await q("document.querySelector('[data-random]').textContent")) === "Surprise me");

// Opening a card glides: the transition runs, with the card's photo named.
const glided = await q(`new Promise((done) => {
  document.addEventListener("turbo:before-render", (e) => {
    const render = e.detail.render;
    e.detail.render = async (a, b) => { await render(a, b); requestAnimationFrame(() => done(document.getAnimations().some((x) => String(x.effect?.pseudoElement).startsWith("::view-transition")))); };
  }, { once: true, capture: true });
  document.querySelector('.card[data-slug="baked-ziti"] .card__link').click();
  setTimeout(() => done("timeout"), 3000);
})`);
check(`card -> recipe runs a view transition: ${glided}`, glided === true);
await sleep(800);

// Light theme: manila paper, dark text, and still no overflow.
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await go("/recipes/banana-bread/");
const bg = await q("getComputedStyle(document.body).backgroundColor");
check(`light theme background ${bg}, text ${await q("getComputedStyle(document.body).color")}`, bg === "rgb(243, 237, 225)" && (await q("getComputedStyle(document.body).color")) === "rgb(31, 26, 20)");
check("fits", await q("document.documentElement.scrollWidth <= innerWidth"));
await shot("light-recipe-mobile");
await go("/recipes/");
await shot("light-recipes-mobile");
await go("/recipes/cannoli-dip/");
await q("document.querySelector('[data-cook]').click()"); await sleep(400);
await shot("light-cook-mobile");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/");
await shot("light-home-desktop");
await go("/recipes/cannoli-dip/");
await shot("light-recipe-desktop");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await go("/recipes/cannoli-dip/");
check(`desktop: Start cooking sits in the page: ${await q("getComputedStyle(document.querySelector('[data-cook]')).position")}`, (await q("getComputedStyle(document.querySelector('[data-cook]')).position")) === "static");
await shot("recipe-desktop");
await q("localStorage.clear()");
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
