// What you're cooking: "Cooking" in the header (with a menu), "Pick up where
// you left off" on the home and Recipes pages, and "Step 3 of 8" on cards.
import { open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = (s) => ev(s);
const item = "document.querySelector('[data-cooking]')";
const label = `${item}.querySelector('[data-cooking-label]').textContent`;
const count = `${item}.querySelector('[data-cooking-count]')`;
const menu = "document.querySelector('[data-cooking-menu]')";
const rows = (where) => `[...document.querySelectorAll('${where} .cooking-row')].map(li => li.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')`;
const resume = "document.querySelector('[data-resume]')";
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
check("nothing started: no Cooking in the header", await q(`${item}.hidden`));
const total = await q("document.querySelectorAll('.step').length");
await q("document.querySelectorAll('.step__num')[1].click()");
check(`tick a step: "${await q(label)}" shows up in the header right away`, !(await q(`${item}.hidden`)) && (await q(label)) === "Cooking" && await q(`${count}.hidden`));
// (The page width is checked against the phone's, not innerWidth, which grows
// with the page when something's too wide.)
check(`the header still fits: page ${await q("document.documentElement.scrollWidth")}px wide`, (await q("document.documentElement.scrollWidth")) <= 390 && await q("document.querySelector('.site-header__inner').getBoundingClientRect().height < 70"));
await shot("cooking-header-mobile");
check("no pot hint on the recipe itself", await q("!document.querySelector('[data-cooking-hint]')"));

// Recipes page: pick up where you left off, and the card says how far.
await go("/recipes/");
check(`Pick up where you left off: ${await q(rows("[data-resume]"))}`, !(await q(`${resume}.hidden`)) && (await q(rows("[data-resume]"))).startsWith(`Banana Bread On step 3 of ${total}`));
check(`photo: ${await q(`${resume}.querySelector('.cooking-row__art img')?.getAttribute('src')`)}`, /banana-bread-480\.webp$/.test(await q(`${resume}.querySelector('.cooking-row__art img')?.getAttribute('src')`)));
check(`its card: "${await q("document.querySelector('.card[data-slug=\"banana-bread\"] .card__progress')?.textContent")}"`,
  (await q("document.querySelector('.card[data-slug=\"banana-bread\"] .card__progress').textContent")) === `Step 3 of ${total}`);
check("no bottom bar: nothing floating over the page", await q("document.querySelector('.timers').hidden && !document.querySelector('.now-cooking')"));
const hint = "document.querySelector('[data-cooking-hint]')";
check(`elsewhere, the first time: "${await q(`${hint}?.innerText`)}"`, /Tap the pot to get back to Banana Bread/.test(await q(`${hint}?.innerText`)));
check("it sits under the pot, on screen", await q(`(() => { const h = ${hint}.getBoundingClientRect(), p = document.querySelector('[data-cooking-toggle]').getBoundingClientRect(); return h.top >= p.bottom && h.right >= p.left && h.right <= document.documentElement.clientWidth; })()`));
await shot("cooking-hint-mobile");
await go("/plan/");
check("still there on the next page until dismissed", await q(`!!${hint}`));
await tap(".cooking-hint__ok");
check("Got it: gone", await q(`!${hint}`));
await go("/recipes/");
check("and stays gone", await q(`!${hint}`));
await q("localStorage.removeItem('hawkins:cooking-hint')"); await go("/recipes/");
await tap("[data-cooking-toggle]");
check("tapping the pot counts as seeing it", await q(`!${hint}`) && (await q("localStorage.getItem('hawkins:cooking-hint')")) === "1");
await tap("h1");
await shot("cooking-resume-mobile");

// The header menu.
await tap("[data-cooking-toggle]");
check(`tap Cooking: the menu opens: ${await q(rows("[data-cooking-menu]"))}`, !(await q(`${menu}.hidden`)) && (await q(rows("[data-cooking-menu]"))).startsWith("Banana Bread"));
check("menu fits on screen", await q(`(() => { const r = ${menu}.getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth; })()`));
await shot("cooking-menu-mobile");
await tap("h1");
check("tap outside: it closes", await q(`${menu}.hidden`));
await tap("[data-cooking-toggle]");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(200);
check("Escape closes it", await q(`${menu}.hidden`));

// Two going: a count. A timer counts down in the tray and the menu; the
// header keeps saying Cooking, so the countdown isn't shown twice.
await go("/recipes/baked-ziti/");
await q("document.querySelector('.ingredients input[type=checkbox]').click()");
check(`two going: count ${await q(`${count}.textContent`)}`, !(await q(`${count}.hidden`)) && (await q(`${count}.textContent`)) === "2");
await go("/plan/");
await q("HawkinsTimers.start({ key: 'baked-ziti:1', seconds: 300, recipe: 'Baked Ziti', url: '/recipes/baked-ziti/', step: 1, title: '', time: '5 min' })"); await sleep(1300);
check(`a timer: the header still says "${await q(label)}"`, (await q(label)) === "Cooking");
await tap("[data-cooking-toggle]");
check(`and the menu says which step it's for: ${await q(rows("[data-cooking-menu]"))}`, /Baked Ziti Getting ingredients Done ⏱︎ [45]:\d\d · Step 1 ›/.test(await q(rows("[data-cooking-menu]"))));
// Tapping the timer line goes to its step, like the tray.
await q("document.querySelector('[data-cooking-menu] .cooking-row__timer').click()"); await sleep(1500);
check(`timer line -> ${await q("location.pathname + location.hash")}, cook mode at ${await q("document.querySelector('[data-cook-count]')?.textContent")}`,
  (await q("location.pathname")) === "/recipes/baked-ziti/" && await q("document.querySelector('.cook').open") && (await q("document.querySelector('[data-cook-count]').textContent")).startsWith("Step 1 of"));
await q("document.querySelector('[data-cook-close]').click()"); await sleep(300);
await go("/plan/");
await tap("[data-cooking-toggle]");
check("the timer keeps its own pill at the bottom", await q("[...document.querySelectorAll('.timer')].filter(t => !t.hidden).length === 1"));
check(`fits, with the count: ${await q("document.documentElement.scrollWidth")}px`, (await q("document.documentElement.scrollWidth")) <= 390);
// With the Plan count showing too, nothing gets squeezed together.
await q(`localStorage.setItem('hawkins:plan', JSON.stringify({ recipes: [{ slug: 'goulash', scale: 1 }], checked: [] }))`);
const planGap = "(() => { const l = document.querySelector('.plan-link__label').getBoundingClientRect(), c = document.querySelector('[data-plan-count]').getBoundingClientRect(); return Math.round(c.left - l.right); })()";
await go("/recipes/");
check(`Plan's count keeps its space: ${await q(planGap)}px`, (await q(planGap)) >= 4 && (await q("document.documentElement.scrollWidth")) <= 390);
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
await go("/plan/");
check(`a small iPhone (375px) too: ${await q("document.documentElement.scrollWidth")}px, Plan's count ${await q(planGap)}px away`, (await q("document.documentElement.scrollWidth")) <= 375 && (await q(planGap)) >= 4);
await q("localStorage.removeItem('hawkins:plan')");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go("/plan/");
await tap("[data-cooking-toggle]");
await shot("cooking-menu-timer");

// Done clears it, with a moment to undo.
await q(`[...${menu}.querySelectorAll('.cooking-row')].find(li => li.textContent.includes('Baked Ziti')).querySelector('.cooking-row__done').click()`); await sleep(200);
check(`Done: ${await q(rows("[data-cooking-menu]"))}, menu still open`, (await q(rows("[data-cooking-menu]"))).includes("Cleared Baked Ziti Undo") && !(await q(`${menu}.hidden`)) && (await q(`${count}.hidden`)));
await q(`${menu}.querySelector('.cooking-row__undo').click()`); await sleep(200);
check(`Undo: back (${await q(rows("[data-cooking-menu]"))})`, (await q(rows("[data-cooking-menu]"))).includes("Baked Ziti Getting ingredients") && (await q(`${count}.textContent`)) === "2");
await q(`[...${menu}.querySelectorAll('.cooking-row')].find(li => li.textContent.includes('Baked Ziti')).querySelector('.cooking-row__done').click()`);
await sleep(5400);
check(`after a moment it's gone: ${await q(rows("[data-cooking-menu]"))}`, !(await q(rows("[data-cooking-menu]"))).includes("Ziti"));
check(`servings kept: ${await q("JSON.parse(localStorage.getItem('hawkins:recipe:baked-ziti')).scale")}`, (await q("JSON.parse(localStorage.getItem('hawkins:recipe:baked-ziti')).scale")) === 1);
await q("localStorage.removeItem('hawkins:timers')");

// Done on the recipe you're looking at: its ticks clear on the page, the menu
// stays open, and Undo puts them back (no reload).
await go("/recipes/banana-bread/");
await q("window.__samePage = 1");
await tap("[data-cooking-toggle]");
await tap('[data-cooking-menu] .cooking-row[data-slug="banana-bread"] .cooking-row__done');
check(`Done here: menu open ${!(await q(`${menu}.hidden`))}, steps ticked ${await q("document.querySelectorAll('.step.is-done').length")}, Start over ${await q("document.querySelector('[data-reset]').hidden ? 'hidden' : 'shown'")}`,
  !(await q(`${menu}.hidden`)) && (await q("document.querySelectorAll('.step.is-done').length")) === 0 && await q("document.querySelector('[data-reset]').hidden"));
await tap("[data-cooking-menu] .cooking-row__undo");
check(`Undo here: ${await q("document.querySelectorAll('.step.is-done').length")} steps back, menu open, same page`,
  (await q("document.querySelectorAll('.step.is-done').length")) === 2 && !(await q(`${menu}.hidden`)) && (await q("window.__samePage")) === 1);
await tap("h1");

// Only ingredients ticked lasts 2 hours; a step done lasts 12.
await q("(() => { const k = 'hawkins:recipe:goulash'; localStorage.setItem(k, JSON.stringify({ ingredients: ['1-1'], steps: [], scale: 1, at: Date.now() - 2.5 * 3600e3, title: 'Easy Goulash', url: '/recipes/goulash/', total: 5 })); })()");
await q("(() => { const k = 'hawkins:recipe:banana-bread'; const p = JSON.parse(localStorage.getItem(k)); p.at = Date.now() - 3 * 3600e3; localStorage.setItem(k, JSON.stringify(p)); })()");
await go("/");
check(`home, 3 hours later: ${await q(rows("[data-resume]"))}`, (await q(rows("[data-resume]"))).startsWith("Banana Bread") && !(await q(rows("[data-resume]"))).includes("Goulash"));
await shot("cooking-home-mobile");
await go("/recipes/goulash/");
check("and the stray tick is gone on the recipe too", await q("!document.querySelector('.ingredients input:checked')"));

// Finishing ends it.
await go("/recipes/banana-bread/");
await q(`document.querySelectorAll('.step__num')[${total - 1}].click()`);
check("every step done: finished, Cooking goes away", await q(`${item}.hidden`));
await go("/recipes/");
check("and so do the section and the card note", (await q(`${resume}.hidden`)) && (await q("document.querySelectorAll('.card__progress').length")) === 0);

await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/recipes/banana-bread/");
await q("document.querySelector('[data-reset]').click()");
await q("document.querySelectorAll('.step__num')[0].click()");
await go("/recipes/");
await tap("[data-cooking-toggle]");
await q("localStorage.removeItem('hawkins:cooking-hint')"); await go("/recipes/");
check("desktop: no pot hint (the word is there)", await q("!document.querySelector('[data-cooking-hint]')"));
await tap("[data-cooking-toggle]");
await shot("cooking-desktop");
await q("localStorage.clear()");
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
