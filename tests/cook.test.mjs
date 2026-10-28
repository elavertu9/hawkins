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
check("timer hint shown before first timer", await q("!!document.querySelector('.cook__hint') && document.querySelector('.cook .timer-start').classList.contains('is-new')"));
await shot("cook-mobile-1");
// Jump to a step from the segments along the top; the steps before it count as done.
const segs = "document.querySelectorAll('.cook__seg')";
check(`segments: ${await q(segs + ".length")}`, (await q(segs + ".length")) === 5 && await q(segs + "[0].getAttribute('aria-current') === 'step'"));
await q(segs + "[3].click()"); await sleep(300);
check(`segment 4 -> ${await q(count)}, ${await q("document.querySelectorAll('.step.is-done').length")} done`, (await q(count)) === "Step 4 of 5" && (await q("document.querySelectorAll('.step.is-done').length")) === 3);
// Or from the step list behind "Step 4 of 5".
await q("document.querySelector('[data-cook-steps-toggle]').click()"); await sleep(300);
check(`step list: ${await q("[...document.querySelectorAll('.cook__pick-title')].map(t => t.textContent).join(' | ')")}`, (await q("document.querySelectorAll('.cook__pick').length")) === 5 && await q("!document.querySelector('[data-cook-steps-panel]').hidden"));
check(`current marked: ${await q("document.querySelector('.cook__pick[aria-current]').textContent")}`, /^04.*You're here$/.test(await q("document.querySelector('.cook__pick[aria-current]').textContent")));
check("step list covers Next", await q("document.querySelector('.cook__nav').inert"));
await shot("cook-mobile-steps");
await q("document.querySelectorAll('.cook__pick')[1].click()"); await sleep(300);
check(`pick step 2 -> ${await q(count)}, list closed, back to ${await q("document.querySelectorAll('.step.is-done').length")} done`, (await q(count)) === "Step 2 of 5" && await q("document.querySelector('[data-cook-steps-panel]').hidden") && (await q("document.querySelectorAll('.step.is-done').length")) === 1);
await q("document.querySelector('[data-cook-steps-toggle]').click()"); await sleep(200);
await key("Escape");
check("Escape closes step list only", await q("document.querySelector('[data-cook-steps-panel]').hidden && document.querySelector('.cook').open"));
await q(segs + "[0].click()"); await sleep(300);
await key("ArrowRight");
check(`ArrowRight -> ${await q(count)}, step 1 done on page: ${await q("document.querySelector('#step-1').classList.contains('is-done')")}`, (await q(count)) === "Step 2 of 5" && await q("document.querySelector('#step-1').classList.contains('is-done')"));
await q("document.querySelector('[data-cook-next]').click()"); await sleep(300);
await q("document.querySelector('.cook .timer-start').click()"); await sleep(400);
const tray = "document.querySelector('.timers')";
check(`timer started: ${await q(tray + ".textContent")} | in dialog: ${await q(tray + ".parentElement.tagName")}`, (await q(tray + ".parentElement.tagName")) === "DIALOG" && /4:00|3:59/.test(await q(tray + ".textContent")));
check("timer dot on step 3 segment", await q(segs + "[2].classList.contains('has-timer') && !" + segs + "[1].classList.contains('has-timer')"));
check(`timer label: ${await q("document.querySelector('.timer__label').textContent")}`, (await q("document.querySelector('.timer__step').textContent")) === "Step 3: Cook the broccoli" && (await q("document.querySelector('.timer__meta').textContent")) === "Beef and Broccoli · 4–5 minutes");
check("hint gone after first timer", await q("!document.querySelector('.cook__hint') && !document.querySelector('.timer-start.is-new') && localStorage.getItem('hawkins:timer-hint-seen') === '1'"));
await shot("cook-mobile-timer");
await q("document.querySelector('[data-cook-ingredients]').click()"); await sleep(200);
check("ingredients panel open", await q("!document.querySelector('[data-cook-panel]').hidden"));
await q("document.querySelector('[data-mirror=\"1-1\"]').click()"); await sleep(100);
check("mirror check -> page box checked", await q("document.querySelector('[data-key=\"1-1\"]').checked"));
await shot("cook-mobile-ingredients");
// The panel covers everything: taps where Next / close sit hit the panel, not cook mode.
const hit = (sel) => `(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!el.closest('[data-cook-panel]'); })()`;
check("panel covers Next and close", await q(hit(".cook__nav .cook__next")) && await q(hit("[data-cook-close]")));
check(`panel back button: "${await q("document.querySelector('[data-cook-panel-back]').textContent")}"`, (await q("document.querySelector('[data-cook-panel-back]').textContent")) === "Back to step 3");
await key("ArrowRight");
check(`arrow keys ignored under panel: ${await q(count)}`, (await q(count)) === "Step 3 of 5");
await q("history.back()"); await sleep(500);
check(`back gesture closes panel only: open=${await q("document.querySelector('.cook').open")} hash ${await q("location.hash")}`, await q("document.querySelector('[data-cook-panel]').hidden && document.querySelector('.cook').open") && (await q("location.hash")) === "#cook");
check("step view usable again", await q("!document.querySelector('.cook__nav').inert"));
await q("document.querySelector('[data-cook-ingredients]').click()"); await sleep(200);
await q("document.querySelector('[data-cook-panel-back]').click()"); await sleep(200);
check(`"Back to step" closes panel: ${await q(count)}`, await q("document.querySelector('[data-cook-panel]').hidden && document.querySelector('.cook').open") && (await q(count)) === "Step 3 of 5");
await q("document.querySelector('[data-cook-ingredients]').click()"); await sleep(200);
await q("document.querySelector('[data-cook-panel] [aria-label=\"Close ingredients\"]').click()"); await sleep(200);
check("panel ✕ closes panel only", await q("document.querySelector('[data-cook-panel]').hidden && document.querySelector('.cook').open"));
await q("document.querySelector('[data-cook-ingredients]').click()"); await sleep(200);
await key("Escape");
check("Escape closes panel only", await q("document.querySelector('[data-cook-panel]').hidden && document.querySelector('.cook').open"));
await key("Escape"); await sleep(300);
check(`Escape closes cook mode, hash "${await q("location.hash")}", tray in ${await q(tray + ".parentElement.tagName")}`, !(await q("document.querySelector('.cook').open")) && (await q("location.hash")) === "" && (await q(tray + ".parentElement.tagName")) === "BODY");
await shot("page-with-timer");
// The timer follows you to other pages, and tapping it goes back to its step.
await go("/recipes/");
check(`timer shows on other pages: ${await q("document.querySelector('.timer__time') && document.querySelector('.timer__time').textContent")}`, /^[34]:\d\d$/.test(await q("document.querySelector('.timer__time').textContent")));
check("sound button until tapped", await q("!document.querySelector('.timers__sound').hidden"));
await shot("other-page-timer");
await q("document.querySelector('.timer__open').click()"); await sleep(1500);
check(`tap timer -> ${await q("location.pathname")} cook at ${await q(count)}`, (await q("location.pathname")) === "/recipes/beef-and-broccoli/" && await q("document.querySelector('.cook').open") && (await q(count)) === "Step 3 of 5");
await q("document.querySelector('[data-cook-close]').click()"); await sleep(300);
check(`closing after timer link: hash "${await q("location.hash")}"`, (await q("location.hash")) === "");
await go("/recipes/beef-and-broccoli/");
check(`timer restored after leaving: ${await q("document.querySelector('.timer__time') && document.querySelector('.timer__time').textContent")}`, /^[34]:\d\d$/.test(await q("document.querySelector('.timer__time').textContent")));
check("restored button shows running", await q("(() => { document.querySelector('[data-cook]').click(); const r = document.querySelector('.cook .timer-start.is-running'); document.querySelector('[data-cook-close]').click(); return !!r; })()"));
await sleep(300);
// Fast-forward the clock just past the end of the 4-minute timer.
await q("(() => { const real = Date.now.bind(Date); Date.now = () => real() + 250 * 1000; })()"); await sleep(600);
check(`timer done: ${await q(tray + ".textContent")}`, await q("document.querySelector('.timer').classList.contains('is-done')"));
check("finished timer stays up with Stop and Continue", await q("!document.querySelector('.timer__actions').hidden && !document.querySelector('.timer__stop').hidden"));
await shot("timer-finished");
await q("document.querySelector('.timer__stop').click()"); await sleep(300);
check("Stop alarm silences but keeps Continue", await q("(() => { const t = document.querySelector('.timer'); return t.classList.contains('is-stopped') && document.querySelector('.timer__stop').hidden && !document.querySelector('.timer__actions').hidden && JSON.parse(localStorage.getItem('hawkins:timers'))[0].stopped === true; })()"));
await shot("timer-stopped");
await q("document.querySelector('.timer__cancel').click()"); await sleep(100);
check("dismissed, tray hidden", await q(tray + ".hidden"));
check("dismissed timer forgotten", await q("localStorage.getItem('hawkins:timers') === null"));
// A timer that finished while you were away says how long ago.
const finished = "localStorage.setItem('hawkins:timers', JSON.stringify([{ key: 'x:0-0', recipe: 'Beef and Broccoli', url: '/recipes/beef-and-broccoli/', step: 1, title: 'Get ready', time: '30 minutes', end: Date.now() - 8 * 60 * 1000 }]))"; // this page's clock still runs 250 s fast
await q(finished);
await go("/recipes/");
check(`finished while away: ${await q("document.querySelector('.timer__time').textContent")}`, /^Done [34] min ago$/.test(await q("document.querySelector('.timer__time').textContent")));
await q("document.querySelector('.timer__continue').click()"); await sleep(1500);
check(`Continue recipe -> ${await q("location.pathname")} at ${await q(count)}, timer gone`, (await q("location.pathname")) === "/recipes/beef-and-broccoli/" && (await q(count)) === "Step 1 of 5" && await q("!document.querySelector('.timer')"));
await q("document.querySelector('[data-cook-close]').click()"); await sleep(300);
// Going back to the recipe by yourself also clears its finished timer.
await q(finished.replace("8 * 60", "6 * 60"));
await go("/recipes/beef-and-broccoli/");
check("visiting the recipe clears its finished timer", await q("!document.querySelector('.timer') && localStorage.getItem('hawkins:timers') === null"));
// Reopen asks before picking up where you left off; back button closes it.
const sheetUp = (sel) => `!document.querySelector('${sel}').hidden`;
check(`Continue recipe at step 1 left nothing done: ${await q("document.querySelectorAll('.step.is-done').length")}`, (await q("document.querySelectorAll('.step.is-done').length")) === 0);
await q("document.querySelector('[data-cook]').click()"); await sleep(300);
check("no progress: opens without asking", !(await q(sheetUp("[data-cook-resume]"))));
await q(segs + "[2].click()"); await sleep(200);
await q("document.querySelector('[data-cook-close]').click()"); await sleep(300);
await q("document.querySelector('[data-cook]').click()"); await sleep(300);
check(`reopen asks: ${await q("document.querySelector('[data-cook-resume-title]').textContent")} | ${await q("document.querySelector('[data-cook-resume-continue]').textContent")}`,
  await q(sheetUp("[data-cook-resume]")) && (await q("document.querySelector('[data-cook-resume-title]').textContent")) === "Pick up at step 3?" && await q("document.querySelector('.cook__nav').inert"));
await shot("cook-mobile-resume");
await q("document.querySelector('[data-cook-resume-continue]').click()"); await sleep(300);
check(`Continue -> ${await q(count)}, card gone`, (await q(count)) === "Step 3 of 5" && !(await q(sheetUp("[data-cook-resume]"))));
check(`segments fill from the left: ${await q("[...document.querySelectorAll('.cook__seg')].map(s => s.classList.contains('is-current') ? 'C' : s.classList.contains('is-done') ? 'D' : '-').join('')")}`,
  (await q("[...document.querySelectorAll('.cook__seg')].map(s => s.classList.contains('is-current') ? 'C' : s.classList.contains('is-done') ? 'D' : '-').join('')")) === "DDC--");
check(`current segment shows its number: ${await q("getComputedStyle(document.querySelector('.cook__seg.is-current .cook__seg-num')).opacity")}`,
  (await q("getComputedStyle(document.querySelector('.cook__seg.is-current .cook__seg-num')).opacity")) === "1");
await q("history.back()"); await sleep(500);
check(`back button closes: open=${await q("document.querySelector('.cook').open")} path=${await q("location.pathname + location.hash")}`, !(await q("document.querySelector('.cook').open")) && (await q("location.pathname + location.hash")) === "/recipes/beef-and-broccoli/");
// Start from step 1 on the card clears steps (not ingredients).
await q("(() => { const b = document.querySelector('.ingredients input[type=checkbox]'); if (!b.checked) b.click(); })()");
await q("document.querySelector('[data-cook]').click()"); await sleep(300);
await q("document.querySelector('[data-cook-resume] [data-cook-restart]').click()"); await sleep(300);
check(`Start from step 1 -> ${await q(count)}, done ${await q("document.querySelectorAll('.step.is-done').length")}, kept ${await q("document.querySelector('.ingredients input[type=checkbox]').checked")}`, (await q(count)) === "Step 1 of 5" && (await q("document.querySelectorAll('.step.is-done').length")) === 0 && await q("document.querySelector('.ingredients input[type=checkbox]').checked"));
// Jumping ahead then Next fills in everything before.
await q(segs + "[3].click()"); await sleep(200);
await q("document.querySelector('[data-cook-next]').click()"); await sleep(300);
check(`jump to 4 + Next: ${await q("document.querySelectorAll('.step.is-done').length")} done, at ${await q(count)}`, (await q("document.querySelectorAll('.step.is-done').length")) === 4 && (await q(count)) === "Step 5 of 5");
// Start over from the step list (only offered once there's progress).
await q("document.querySelector('[data-cook-steps-toggle]').click()"); await sleep(200);
check("step list offers Start over", await q("!document.querySelector('[data-cook-restart-link]').hidden"));
await q("document.querySelector('[data-cook-restart-link]').click()"); await sleep(300);
check(`step list Start over -> ${await q(count)}, list closed, nothing done`, (await q(count)) === "Step 1 of 5" && await q("document.querySelector('[data-cook-steps-panel]').hidden") && (await q("document.querySelectorAll('.step.is-done').length")) === 0);
await q("document.querySelector('[data-cook-steps-toggle]').click()"); await sleep(200);
check("no Start over with no progress", await q("document.querySelector('[data-cook-restart-link]').hidden"));
await key("Escape");
// Finish shows the all-done card.
for (let i = 0; i < 5; i++) { await q("document.querySelector('[data-cook-next]').click()"); await sleep(150); }
check(`finish: card up, all done: ${await q("document.querySelectorAll('.step.is-done').length")}`, await q("document.querySelector('.cook').open") && await q(sheetUp("[data-cook-finished]")) && (await q("document.querySelectorAll('.step.is-done').length")) === 5);
await shot("cook-mobile-finished");
await q("document.querySelector('[data-cook-finish-back]').click()"); await sleep(300);
check(`Back to the last step -> ${await q(count)}, card gone, last step not done: ${await q("document.querySelectorAll('.step.is-done').length")}`,
  (await q(count)) === "Step 5 of 5" && !(await q(sheetUp("[data-cook-finished]"))) && (await q("document.querySelectorAll('.step.is-done').length")) === 4);
await q("document.querySelector('[data-cook-next]').click()"); await sleep(300);
await q("document.querySelector('[data-cook-finish-close]').click()"); await sleep(400);
check("Back to recipe closes cook mode", !(await q("document.querySelector('.cook').open")));
// A finished recipe starts fresh next time, without asking.
await q("document.querySelector('[data-cook]').click()"); await sleep(300);
check(`after finishing, reopen -> ${await q(count)}, no card, nothing done`, (await q(count)) === "Step 1 of 5" && !(await q(sheetUp("[data-cook-resume]"))) && (await q("document.querySelectorAll('.step.is-done').length")) === 0);
// Cook it again.
for (let i = 0; i < 5; i++) { await q("document.querySelector('[data-cook-next]').click()"); await sleep(150); }
await q("document.querySelector('[data-cook-finished] [data-cook-restart]').click()"); await sleep(300);
check(`Cook it again -> ${await q(count)}, nothing done`, (await q(count)) === "Step 1 of 5" && !(await q(sheetUp("[data-cook-finished]"))) && (await q("document.querySelectorAll('.step.is-done').length")) === 0);
await q("document.querySelector('[data-cook-close]').click()"); await sleep(300);
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
