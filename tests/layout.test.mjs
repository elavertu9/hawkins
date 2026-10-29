// Recipes page layout: sorting, the results bar, the phone list, the + Plan
// button on mouse and touch screens, and the home page.
import { open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const titles = (n = 4) => ev(`[...document.querySelectorAll('.card:not([hidden]) .card__title')].slice(0, ${n}).map(e => e.textContent.trim()).join(' | ')`);
const sortBy = (value) => ev(`(() => { const s = document.querySelector('[data-sort]'); s.value = '${value}'; s.dispatchEvent(new Event('change')); })()`);
const planOpacity = "getComputedStyle(document.querySelector('.card__plan')).opacity";
const fits = "document.documentElement.scrollWidth <= innerWidth";

// Desktop, with a mouse.
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/recipes/"); await ev("localStorage.clear()"); await go("/recipes/");
await sortBy("az");
const az = await ev("[...document.querySelectorAll('.card__title')].map(e => e.textContent.trim())");
check(`A–Z: ${az.slice(0, 3).join(" | ")}`, az.every((t, i) => i === 0 || az[i - 1].localeCompare(t) <= 0));

await sortBy("quickest");
const totals = await ev("[...document.querySelectorAll('.card')].map(c => c.dataset.total === undefined ? 1e9 : +c.dataset.total)");
check(`Quickest: ${await titles(3)}`, totals.every((t, i) => i === 0 || totals[i - 1] <= t) && (await ev("location.search")) === "?sort=quickest");
check("Quickest puts classified (no time) last", await ev("[...document.querySelectorAll('.card')].slice(-document.querySelectorAll('.card--classified').length).every(c => c.classList.contains('card--classified'))"));

await go("/recipes/?sort=newest&tag=crowd");
const added = await ev("[...document.querySelectorAll('.card:not([hidden])')].map(c => c.dataset.added)");
check(`Newest + Crowd from the URL: ${await titles(3)}`, (await ev("document.querySelector('[data-sort]').value")) === "newest" && added.every((d, i) => i === 0 || added[i - 1] >= d));
check(`count: ${await ev("document.querySelector('[data-status]').textContent")}`, /^Showing \d+ of \d+ recipes$/.test(await ev("document.querySelector('[data-status]').textContent")));
check("every card has an added date", await ev("[...document.querySelectorAll('.card')].every(c => /^\\d{4}-\\d{2}-\\d{2}$/.test(c.dataset.added))"));

await go("/recipes/");
check(`+ Plan hidden until hover: ${await ev(planOpacity)}`, (await ev(planOpacity)) === "0");
const r = await ev("(() => { const b = document.querySelector('.card').getBoundingClientRect(); return { x: b.x + 50, y: b.y + 50 }; })()");
await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...r }); await sleep(300);
check(`+ Plan shows on hover: ${await ev(planOpacity)}`, (await ev(planOpacity)) === "1");
await ev("document.querySelector('.card__plan').click(); document.activeElement.blur()");
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 }); await sleep(300);
check(`a planned card keeps it: ${await ev(planOpacity)}`, (await ev(planOpacity)) === "1");
await ev("document.querySelector('.card__plan').click()");
check("desktop fits", await ev(fits));
await shot("layout-recipes-desktop");

await go("/");
check(`home: ${await ev("document.querySelectorAll('.files > .file').length")} file cards, ${await ev("document.querySelectorAll('.soon-list__item').length")} coming soon`,
  (await ev("document.querySelectorAll('.files > .file.is-soon').length")) === 1);
const home = await ev("[...document.querySelectorAll('.card-grid .card')].map(c => c.dataset.added + ' ' + c.querySelector('.card__title').textContent.trim())");
check(`home shows the newest, ties A–Z: ${home.join(" | ")}`, home.length === 4 && home.every((t, i) => i === 0 || home[i - 1].slice(0, 10) > t.slice(0, 10) || (home[i - 1].slice(0, 10) === t.slice(0, 10) && home[i - 1].localeCompare(t) <= 0)));
await shot("layout-home-desktop");

// Phone, with touch.
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }] });
await go("/recipes/");
check("phone fits", await ev(fits));
check(`+ Plan always shows on touch: ${await ev(planOpacity)}`, (await ev(planOpacity)) === "1");
const perScreen = await ev("(() => { const c = document.querySelectorAll('.card'); return innerHeight / (c[1].getBoundingClientRect().top - c[0].getBoundingClientRect().top); })()");
check(`phone list fits ${perScreen.toFixed(1)} recipes per screen`, perScreen >= 4);
check("Surprise me sits beside the title", await ev("(() => { const a = document.querySelector('.page-title').getBoundingClientRect(), b = document.querySelector('[data-random]').getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 12; })()"));
check("thumbnails are 3:2 and pinned to the top", await ev("[...document.querySelectorAll('.card__media')].slice(0, 5).every(m => { const b = m.getBoundingClientRect(), c = m.closest('.card').getBoundingClientRect(); return Math.abs(b.width / b.height - 1.5) < 0.05 && b.top - c.top < 20; })"));
check("+ Plan sits below the thumbnail", await ev("(() => { const c = document.querySelector('.card'); return c.querySelector('.card__plan').getBoundingClientRect().top >= c.querySelector('.card__media').getBoundingClientRect().bottom; })()"));
await ev("scrollTo(0, document.querySelector('.results').getBoundingClientRect().top + scrollY - 120)"); await sleep(300);
await shot("layout-recipes-phone");
await go("/");
check("home fits on a phone", await ev(fits));
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
