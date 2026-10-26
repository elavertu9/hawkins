// Cook mode, timers, and step checklists on recipe pages.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = (s) => ev(s);
const key = async (k, code) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: code || k, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37, Escape: 27 }[k] });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: code || k }); await sleep(250); };
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go("/recipes/beef-and-broccoli/");
await ev("localStorage.clear()"); await go("/recipes/beef-and-broccoli/");
check("cook button visible", await q("!document.querySelector('[data-cook]').hidden"));
await q("document.querySelector('[data-cook]').click()"); await sleep(300);
const count = "document.querySelector('[data-cook-count]').textContent";
check(`opened: ${await q(count)} | hash ${await q("location.hash")}`, await q("document.querySelector('.cook').open") && (await q(count)) === "Step 1 of 5" && (await q("location.hash")) === "#cook");
check(`step 1 timer buttons: ${await q("[...document.querySelectorAll('.cook .timer-start')].map(b=>b.textContent)")}`, (await q("document.querySelectorAll('.cook .timer-start').length")) === 1);
await shot("cook-mobile-1");
await key("ArrowRight");
check(`ArrowRight -> ${await q(count)}, step 1 done on page: ${await q("document.querySelector('#step-1').classList.contains('is-done')")}`, (await q(count)) === "Step 2 of 5" && await q("document.querySelector('#step-1').classList.contains('is-done')"));
await q("document.querySelector('[data-cook-next]').click()"); await sleep(300);
await q("document.querySelector('.cook .timer-start').click()"); await sleep(400);
const tray = "document.querySelector('.timers')";
check(`timer started: ${await q(tray + ".textContent")} | in dialog: ${await q(tray + ".parentElement.tagName")}`, (await q(tray + ".parentElement.tagName")) === "DIALOG" && /4:00|3:59/.test(await q(tray + ".textContent")));
await shot("cook-mobile-timer");
await q("document.querySelector('[data-cook-ingredients]').click()"); await sleep(200);
check("ingredients panel open", await q("!document.querySelector('[data-cook-panel]').hidden"));
await q("document.querySelector('[data-mirror=\"1-1\"]').click()"); await sleep(100);
check("mirror check -> page box checked", await q("document.querySelector('[data-key=\"1-1\"]').checked"));
await shot("cook-mobile-ingredients");
await key("Escape");
check("Escape closes panel only", await q("document.querySelector('[data-cook-panel]').hidden && document.querySelector('.cook').open"));
await key("Escape"); await sleep(300);
check(`Escape closes cook mode, hash "${await q("location.hash")}", tray in ${await q(tray + ".parentElement.tagName")}`, !(await q("document.querySelector('.cook').open")) && (await q("location.hash")) === "" && (await q(tray + ".parentElement.tagName")) === "BODY");
await shot("page-with-timer");
// Fast-forward the clock to finish the timer.
await q("(() => { const real = Date.now.bind(Date); Date.now = () => real() + 5 * 60 * 1000; })()"); await sleep(600);
check(`timer done: ${await q(tray + ".textContent")}`, await q("document.querySelector('.timer').classList.contains('is-done')"));
await q("document.querySelector('.timer__cancel').click()"); await sleep(100);
check("dismissed, tray hidden", await q(tray + ".hidden"));
// Reopen resumes at the first unfinished step; back button closes it.
await q("document.querySelector('[data-cook]').click()"); await sleep(300);
check(`reopen resumes at ${await q(count)}`, (await q(count)) === "Step 3 of 5");
await q("history.back()"); await sleep(500);
check(`back button closes: open=${await q("document.querySelector('.cook').open")} path=${await q("location.pathname + location.hash")}`, !(await q("document.querySelector('.cook').open")) && (await q("location.pathname + location.hash")) === "/recipes/beef-and-broccoli/");
// Finish marks all done.
await q("document.querySelector('[data-cook]').click()"); await sleep(300);
for (let i = 0; i < 3; i++) { await q("document.querySelector('[data-cook-next]').click()"); await sleep(150); }
check(`finish closes and all done: ${await q("document.querySelectorAll('.step.is-done').length")}`, !(await q("document.querySelector('.cook').open")) && (await q("document.querySelectorAll('.step.is-done').length")) === 5);
// Deep link.
await go("/recipes/zuppa-toscana/#cook");
check(`#cook deep link opens: ${await q(count)}`, await q("document.querySelector('.cook').open"));
await key("Escape"); await sleep(300);
check(`deep-link close stays on page: ${await q("location.href")}`, (await q("location.pathname")) === "/recipes/zuppa-toscana/" && (await q("location.hash")) === "");
// Upside Down still readable.
await q("sessionStorage.setItem('hawkins:upside-down','1')"); await go("/recipes/banana-bread/");
await q("document.querySelector('[data-cook]').click()"); await sleep(400);
await shot("cook-upside");
check(`upside cook mode fits: ${await q("Math.max(...[...document.querySelectorAll('.cook *')].map(e => e.getBoundingClientRect().right))")}`, (await q("Math.max(...[...document.querySelectorAll('.cook *')].map(e => e.getBoundingClientRect().right))")) <= 391);
await q("sessionStorage.clear()");
// Desktop.
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await go("/recipes/banana-bread/");
await shot("cook-desktop-page");
await q("document.querySelector('[data-cook]').click()"); await sleep(300);
await q("document.querySelector('[data-cook-next]').click()"); await sleep(400);
await shot("cook-desktop");
// Every recipe: each bold time becomes a timer button, nothing else does.
const slugs = (await (await fetch(BASE + "/recipes/")).text()).match(/href="\/recipes\/[^"]+\/"/g).map((h) => h.slice(6, -1));
let bad = [], total = 0;
await ev("localStorage.clear()");
for (const slug of [...new Set(slugs)]) {
  await send("Page.navigate", { url: BASE + slug }); await sleep(500);
  if (await q("!!document.querySelector('[data-classified]')")) continue;
  const r = await q(`(() => { const d = document.querySelector('.cook'); document.querySelector('[data-cook]').click();
    const out = []; const n = document.querySelectorAll('.step').length;
    for (let i = 0; i < n; i++) {
      const bold = [...document.querySelectorAll('#step-' + (i+1) + ' .step__text strong')].filter(s => /(sec|min|hour|hr)/i.test(s.textContent) && !/°/.test(s.textContent)).length;
      const btn = d.querySelectorAll('.timer-start').length; out.push([bold, btn]);
      document.querySelector('[data-cook-next]').click(); }
    return out; })()`);
  r.forEach(([b, t], i) => { total += t; if (b !== t) bad.push(`${slug} step ${i + 1}: ${b} bold vs ${t} buttons`); });
}
check(`all recipes: ${total} timer buttons; mismatches: ${bad.join("; ") || "none"}`, bad.length === 0);
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
