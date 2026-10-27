// The meal plan: adding recipes, scaling, the shopping list, and shared links.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = ev;
const badge = "(() => { const b = document.querySelector('[data-plan-count]'); return b.hidden ? 'hidden' : b.textContent; })()";
const row = (name) => `(() => { const li = [...document.querySelectorAll('.aisle li')].find(li => li.querySelector('.shopping__name').textContent === ${JSON.stringify(name)}); return li ? li.querySelector('.qty').textContent : null; })()`;
const fits = "document.documentElement.scrollWidth <= innerWidth";
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go("/recipes/"); await q("localStorage.clear()"); await go("/recipes/");
check(`badge starts ${await q(badge)}`, (await q(badge)) === "hidden");
check(`card buttons: ${await q("document.querySelectorAll('.card__plan:not([hidden])').length")}`, (await q("document.querySelectorAll('.card__plan:not([hidden])').length")) === 43);
await q("document.querySelector('.card__plan[data-plan-add=\"beef-and-broccoli\"]').click()"); await sleep(300);
check(`card add: badge ${await q(badge)}, label "${await q("document.querySelector('.card__plan[data-plan-add=\"beef-and-broccoli\"]').textContent")}", still on ${await q("location.pathname")}`,
  (await q(badge)) === "1" && (await q("location.pathname")) === "/recipes/");
check("recipes page fits", await q(fits));
await shot("plan-cards");
await go("/recipes/goulash/");
check(`hero button: "${await q("document.querySelector('.button--plan').textContent")}"`, (await q("document.querySelector('.button--plan').textContent")) === "+ Add to meal plan");
await q("document.querySelector('.button--plan').click()"); await sleep(200);
check(`hero added: "${await q("document.querySelector('.button--plan').textContent")}", badge ${await q(badge)}`, (await q(badge)) === "2");
check("recipe page fits", await q(fits));
await shot("plan-hero");
await go("/plan/");
check(`plan lists: ${await q("[...document.querySelectorAll('.plan-item__title')].map(a => a.textContent).join(', ')")}`, (await q("document.querySelectorAll('.plan-item').length")) === 2);
check(`broccoli 1x: ${await q(row("broccoli"))}`, (await q(row("broccoli"))) === "1 pound");
await q("document.querySelectorAll('.plan-item')[0].querySelector('[data-step=\"1\"]').click()"); await sleep(200);
check(`2x: stepper ${await q("document.querySelector('.stepper__value').textContent")}, broccoli ${await q(row("broccoli"))}, serves ${await q("document.querySelector('.plan-item__meta').textContent")}`,
  (await q(row("broccoli"))) === "2 pounds" && (await q("document.querySelector('.plan-item__meta').textContent")).startsWith("Serves 8"));
check(`ground beef (goulash 1x + none): ${await q(row("ground beef"))}`, true);
await q("[...document.querySelectorAll('.aisle li')].find(li => li.querySelector('.shopping__name').textContent === 'broccoli').querySelector('input').click()"); await sleep(200);
check(`count after check: ${await q("document.querySelector('[data-plan-item-count]').textContent")}`, /1 checked/.test(await q("document.querySelector('[data-plan-item-count]').textContent")));
await go("/plan/");
check("check persists after reload", await q("[...document.querySelectorAll('.aisle li')].find(li => li.querySelector('.shopping__name').textContent === 'broccoli').querySelector('input').checked"));
check("plan page fits", await q(fits));
await shot("plan-mobile");
await q("document.querySelector('[data-plan-uncheck]').click()"); await sleep(200);
check("uncheck all", !(await q("document.querySelector('[data-plan-item-count]').textContent")).includes("checked"));
// Add via select
await q("(() => { const s = document.querySelector('[data-plan-select]'); s.value = 'banana-bread'; s.dispatchEvent(new Event('change')); })()"); await sleep(200);
check(`select add -> ${await q("document.querySelectorAll('.plan-item').length")} recipes, option disabled ${await q("document.querySelector('option[value=\"banana-bread\"]').disabled")}`, (await q("document.querySelectorAll('.plan-item').length")) === 3);
// Remove
await q("document.querySelectorAll('.plan-item__remove')[2].click()"); await sleep(200);
check(`remove -> ${await q("document.querySelectorAll('.plan-item').length")}, badge ${await q(badge)}`, (await q("document.querySelectorAll('.plan-item').length")) === 2 && (await q(badge)) === "2");
// Copy list (headless may refuse the clipboard; the toast still reports)
await q("document.querySelector('[data-plan-copy]').click()"); await sleep(300);
check(`copy toast: ${await q("document.querySelector('[data-plan-toast]').textContent")}`, /copied|Couldn't/.test(await q("document.querySelector('[data-plan-toast]').textContent")));
// Shared link with an existing plan -> banner
await go("/plan/?r=banana-bread,whoopie-pies:2,not-a-recipe");
check(`shared banner: ${await q("document.querySelector('[data-plan-shared]').hidden ? 'hidden' : document.querySelector('[data-plan-shared]').textContent.replace(/\\s+/g,' ').trim()")}`, !(await q("document.querySelector('[data-plan-shared]').hidden")));
await shot("plan-shared");
await q("document.querySelector('[data-plan-shared-use]').click()"); await sleep(200);
check(`use shared: ${await q("[...document.querySelectorAll('.plan-item')].map(li => li.querySelector('a').textContent + ' ' + li.querySelector('.stepper__value').textContent).join(', ')")} | url ${await q("location.search")}`,
  (await q("document.querySelectorAll('.plan-item').length")) === 2 && (await q("location.search")) === "");
// Shared link into an empty plan -> loads directly
await q("localStorage.clear()");
await go("/plan/?r=goulash");
check(`empty plan adopts shared: ${await q("document.querySelectorAll('.plan-item').length")}, banner hidden ${await q("document.querySelector('[data-plan-shared]').hidden")}`, (await q("document.querySelectorAll('.plan-item').length")) === 1);
// Empty state
await q("localStorage.clear()"); await go("/plan/");
check("empty state shown, list hidden", await q("!document.querySelector('[data-plan-empty]').hidden && document.querySelector('[data-plan-list-tools]').hidden"));
await shot("plan-empty");
// Desktop with a few recipes
await q(`localStorage.setItem('hawkins:plan', JSON.stringify({recipes: [{slug:'beef-and-broccoli',scale:1},{slug:'goulash',scale:2},{slug:'famous-chocolate-cake',scale:1},{slug:'baked-ziti',scale:1}], checked: []}))`);
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/plan/");
check("desktop fits", await q(fits));
await shot("plan-desktop");
await go("/");
check(`home page badge ${await q(badge)}`, (await q(badge)) === "4");
await shot("plan-header");
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
