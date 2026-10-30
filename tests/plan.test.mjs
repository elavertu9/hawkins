// The meal plan: adding recipes, scaling, the shopping list, and shared links.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = ev;
const badge = "(() => { const b = document.querySelector('[data-plan-count]'); return b.hidden ? 'hidden' : b.textContent; })()";
const row = (name) => `(() => { const li = [...document.querySelectorAll('.aisle li')].find(li => li.querySelector('.shopping__name').textContent === ${JSON.stringify(name)}); return li ? li.querySelector('.qty').textContent : null; })()`;
const order = "[...document.querySelectorAll('.aisle li .shopping__name')].map(e => e.textContent).join('|')";
const fits = "document.documentElement.scrollWidth <= document.documentElement.clientWidth";
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
check(`+: serves ${await q("document.querySelector('.stepper__value').textContent")}, broccoli ${await q(row("broccoli"))}`,
  (await q(row("broccoli"))) === "2 pounds" && (await q("document.querySelector('.stepper__value').textContent")) === "8");
check(`ground beef (goulash 1x + none): ${await q(row("ground beef"))}`, true);
const orderBefore = await q(order);
await q("window.__wake = []; const set = HawkinsPage.wake.set; HawkinsPage.wake.set = (n, on) => { window.__wake.push(n + ':' + on); return set.call(HawkinsPage.wake, n, on); }");
await q("[...document.querySelectorAll('.aisle li')].find(li => li.querySelector('.shopping__name').textContent === 'broccoli').querySelector('input').click()"); await sleep(200);
const broccoli = "[...document.querySelectorAll('.aisle li')].find(li => li.querySelector('.shopping__name').textContent === 'broccoli')";
check(`checked: struck through in its aisle, nothing moves: ${await q("document.querySelector('[data-plan-item-count]').textContent")}`, /1 in the cart/.test(await q("document.querySelector('[data-plan-item-count]').textContent"))
  && await q(`${broccoli}.querySelector('input').checked`) && (await q(row("broccoli"))) === "2 pounds" && (await q(order)) === orderBefore);
check("no 'In the cart' section", await q("!document.querySelector('[data-plan-cart]') && !document.querySelector('.cart') && ![...document.querySelectorAll('summary')].some(s => /in the cart/i.test(s.textContent))"));
check(`the screen stays on once something is checked: ${await q("window.__wake.join()")}`, (await q("window.__wake.join()")).includes("shopping:true"));
await go("/plan/");
check("check and order persist after reload", await q(`${broccoli}.querySelector('input').checked`) && (await q(order)) === orderBefore);
// On a phone the recipes fold into one line above the list.
const summary = "document.querySelector('[data-plan-summary]')";
check(`folded: "${await q(summary + ".textContent.replace(/\\s+/g, ' ').trim()")}"`, await q(`!${summary}.hidden && document.querySelector('[data-plan-recipes-body]').hidden`));
await q(summary + ".click()"); await sleep(200);
check("Edit opens the recipes", await q("!document.querySelector('[data-plan-recipes-body]').hidden && !document.querySelector('[data-plan-summary-done]').hidden"));
await q("document.querySelector('[data-plan-summary-done]').click()"); await sleep(200);
check("Done folds them again", await q("document.querySelector('[data-plan-recipes-body]').hidden"));
check(`folded summary fits: Edit at ${await q("Math.round(document.querySelector('.plan-summary__edit').getBoundingClientRect().right)")}`, await q("document.querySelector('.plan-summary__edit').getBoundingClientRect().right <= document.documentElement.clientWidth && document.querySelector('.shopping').getBoundingClientRect().right <= document.documentElement.clientWidth"));
check("plan page fits", await q(fits));
await shot("plan-mobile");
await q("document.querySelector('[data-plan-uncheck]').click()"); await sleep(200);
check("uncheck all (from the … menu)", !(await q("document.querySelector('[data-plan-item-count]').textContent")).includes("cart") && (await q(row("broccoli"))) === "2 pounds" && (await q(order)) === orderBefore);
// Add via select
await q("(() => { const s = document.querySelector('[data-plan-select]'); s.value = 'banana-bread'; s.dispatchEvent(new Event('change')); })()"); await sleep(200);
check(`select add -> ${await q("document.querySelectorAll('.plan-item').length")} recipes, option disabled ${await q("document.querySelector('option[value=\"banana-bread\"]').disabled")}`, (await q("document.querySelectorAll('.plan-item').length")) === 3);
// Remove
await q("document.querySelectorAll('.plan-item__remove')[2].click()"); await sleep(200);
check(`remove -> ${await q("document.querySelectorAll('.plan-item').length")}, badge ${await q(badge)}`, (await q("document.querySelectorAll('.plan-item').length")) === 2 && (await q(badge)) === "2");
// Share (headless may refuse the clipboard; the toast still reports)
await q("Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })"); // copy instead of the share sheet
await q("document.querySelector('[data-plan-share]').click()"); await sleep(300);
check(`copy toast: ${await q("document.querySelector('[data-plan-toast]').textContent")}`, /copied|Couldn't/.test(await q("document.querySelector('[data-plan-toast]').textContent")));
// Share and ••• open menus that stay on a phone's screen; Share offers the list or just the link.
const onScreen = (sel) => q(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= document.documentElement.clientWidth; })()`);
await q("document.querySelector('[aria-controls=\"plan-share-menu\"]').click()"); await sleep(150);
check(`Share menu: ${await q("[...document.querySelectorAll('#plan-share-menu button')].map(b => b.firstChild.textContent).join(' / ')")}, on screen`,
  (await q("document.querySelectorAll('#plan-share-menu button').length")) === 2 && await onScreen("#plan-share-menu"));
await shot("plan-share-menu");
await q("document.querySelector('[data-plan-share=\"link\"]').click()"); await sleep(300);
check(`Just the link: "${await q("document.querySelector('[data-plan-toast-text]').textContent")}", menu closed`,
  /Plan link copied|Couldn't/.test(await q("document.querySelector('[data-plan-toast-text]').textContent")) && await q("document.querySelector('#plan-share-menu').hidden"));
await q("document.querySelector('[aria-controls=\"plan-menu\"]').click()"); await sleep(150);
check("••• menu on screen", await onScreen("#plan-menu"));
await shot("plan-more-menu");
await q("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
check("tapping elsewhere closes it", await q("document.querySelector('#plan-menu').hidden"));
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
// Starting from an empty plan on a phone, the recipes stay open while you add.
await q("(() => { const s = document.querySelector('[data-plan-select]'); s.value = 'goulash'; s.dispatchEvent(new Event('change')); })()"); await sleep(200);
check("first recipe added: panel stays open", await q("!document.querySelector('[data-plan-recipes-body]').hidden && document.querySelector('[data-plan-summary]').hidden"));
await go("/plan/");
check("coming back with a plan: folded", await q("document.querySelector('[data-plan-recipes-body]').hidden"));
await q("localStorage.removeItem('hawkins:plan')");
// Favorites show as one-tap adds.
await q("localStorage.setItem('hawkins:favorites', JSON.stringify(['banana-bread', 'goulash']))"); await go("/plan/");
check(`favorites offered: ${await q("[...document.querySelectorAll('[data-plan-faves-list] .chip')].map(c => c.textContent).join(', ')")}`, (await q("document.querySelectorAll('[data-plan-faves-list] .chip').length")) === 2);
await shot("plan-empty-faves");
await q("document.querySelector('[data-plan-faves-list] .chip').click()"); await sleep(200);
check(`tap -> ${await q("[...document.querySelectorAll('.plan-item__title')].map(a => a.textContent).join()")}, one favorite left`, (await q("document.querySelectorAll('.plan-item').length")) === 1 && (await q("document.querySelectorAll('[data-plan-faves-list] .chip').length")) === 1);
// Servings picked on a recipe page come along when it's added.
await q("localStorage.clear()"); await go("/recipes/beef-and-broccoli/");
await q("document.querySelector('[data-servings-step=\"1\"]').click()");
await q("document.querySelector('.button--plan').click()"); await sleep(200);
await go("/plan/");
check(`added at the page's servings: ${await q("document.querySelector('.stepper__value').textContent")}`, (await q("document.querySelector('.stepper__value').textContent")) === "8");
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
