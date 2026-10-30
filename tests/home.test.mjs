// The home page on desktop and phone, and the packing trip under Pick up where you left off.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
for (const [w, h, mobile, label] of [[1280, 1000, false, "desktop"], [390, 844, true, "mobile"]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await go("/");
  await ev("document.querySelector('.files').scrollIntoView()"); await sleep(300);
  check(`${label}: no overflow`, await ev("document.documentElement.scrollWidth <= document.documentElement.clientWidth"));
  check(`${label}: Packing Lists is open, not coming soon`, await ev("[...document.querySelectorAll('.files > .file:not(.is-soon) .file__link')].some(a => a.textContent === 'Packing Lists' && a.getAttribute('href') === '/packing/')")
    && !(await ev("[...document.querySelectorAll('.soon-list__item')].map(e => e.textContent).join()")).includes("Packing"));
  await shot(`files-${label}`);
}

// ---------- Pick up where you left off: the packing trip ----------
const card = "document.querySelector('[data-packing-resume]')";
const cardText = `${card}.querySelector('.cooking-row__title').textContent + ' | ' + ${card}.querySelector('.cooking-row__meta').textContent`;
const trip = (progress, extra = {}) => ev(`localStorage.setItem('hawkins:packing', JSON.stringify(${JSON.stringify({ days: 5, kits: ["flying", "swim"], checked: [], skipped: [], extras: [], setupFolded: false, progress, ...extra })}))`);
const fits = "document.documentElement.scrollWidth <= document.documentElement.clientWidth";
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go("/"); await ev("localStorage.clear()"); await go("/");
check("no trip: no packing card", await ev(`${card}.hidden`));
await trip({ packed: 40, skipped: 8, total: 66 });
await go("/");
check(`a trip: "${await ev(cardText)}"`, !(await ev(`${card}.hidden`)) && (await ev(cardText)) === "Packing: 5 days · Flying · Beach / Pool | 48 of 66 decided");
check("it links to the packing list", (await ev(`${card}.querySelector('a').getAttribute('href')`)) === "/packing/");
check("same look as the recipes card: a row in the same kind of list", await ev(`(() => { const a = getComputedStyle(${card}.querySelector('.cooking-list')), b = getComputedStyle(document.querySelector('[data-resume] .cooking-list')); return a.borderRadius === b.borderRadius && a.backgroundColor === b.backgroundColor && a.maxWidth === b.maxWidth && ${card}.classList.contains('resume'); })()`));
check("it has the heading when it's the only card", await ev(`(() => { const t = ${card}.querySelector('.resume__title').getBoundingClientRect(); return t.width > 10 && t.height > 10; })()`) && (await ev("document.querySelector('[data-resume]').hidden")));
check("the card fits", await ev(fits));
await shot("home-packing-resume-mobile");
await ev(`${card}.querySelector('a').click()`); await sleep(800);
check(`tapping it opens the list: ${await ev("location.pathname")}`, (await ev("location.pathname")) === "/packing/");
// One day, and a one-kit trip.
await trip({ packed: 1, skipped: 0, total: 66 }, { days: 1, kits: [] });
await go("/");
check(`singular day, no kits: ${await ev(cardText)}`, (await ev(cardText)) === "Packing: 1 day | 1 of 66 decided");
// A long trip name wraps instead of running off the screen.
await trip({ packed: 1, skipped: 0, total: 66 }, { days: 14, kits: ["flying", "car", "international", "warm", "swim", "cold", "snow", "hiking", "dressy", "rain", "laundry"] });
await go("/");
check("a long trip name stays on the screen", await ev(fits) && await ev(`(() => { const r = ${card}.querySelector('.cooking-list').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`));
// Gone at 100%, with no trip, or with nothing to count.
await trip({ packed: 60, skipped: 6, total: 66 });
await go("/");
check("everything decided: card gone", await ev(`${card}.hidden`));
await trip({ packed: 0, skipped: 0, total: 0 });
await go("/");
check("total 0: card gone", await ev(`${card}.hidden`));
await trip(undefined);
await go("/");
check("a trip with no progress saved yet: card gone", await ev(`${card}.hidden`));
await ev("localStorage.removeItem('hawkins:packing')");
await go("/");
check("trip cleared: card gone", await ev(`${card}.hidden`));
// Both themes: the card on its own, and the header's badge beside it.
const themes = async (id, name, ok) => {
  for (const t of ["dark", "light"]) {
    await ev(`localStorage.setItem('hawkins:theme', '${t}')`);
    await go("/");
    check(`${t}: ${name}`, await ok() && await ev(fits));
    await shot(`home-packing-resume-${id}-${t}-mobile`);
  }
  await ev("localStorage.removeItem('hawkins:theme')");
};
await trip({ packed: 40, skipped: 8, total: 66 });
await themes("alone", "the card and the header's badge", async () => !(await ev(`${card}.hidden`)) && (await ev("document.querySelector('[data-packing-count]').textContent")) === "73%");
// With a recipe in progress, the two cards stack under one heading.
await ev(`localStorage.setItem('hawkins:recipe:banana-bread', JSON.stringify({ url: '/recipes/banana-bread/', title: 'Banana Bread', steps: [0, 1], ingredients: [], total: 8, at: Date.now() }))`);
await go("/");
check("both cards show", !(await ev("document.querySelector('[data-resume]').hidden")) && !(await ev(`${card}.hidden`)));
check("one heading for the two", await ev(`(() => { const box = (s) => document.querySelector(s).getBoundingClientRect(); return box('#resume-title').height > 10 && box('#packing-resume-title').height <= 1; })()`));
check("and the trip sits right under the recipe card", await ev(`(() => { const a = document.querySelector('[data-resume] .cooking-list').getBoundingClientRect(), b = ${card}.querySelector('.cooking-list').getBoundingClientRect(); return b.top - a.bottom > 4 && b.top - a.bottom < 24; })()`) && await ev(fits));
await themes("both", "with a recipe, two cards, one heading", async () => !(await ev("document.querySelector('[data-resume]').hidden")) && !(await ev(`${card}.hidden`)));
await ev("localStorage.clear()");
check(`JS errors: ${errors.length}`, errors.length === 0);
finish();
