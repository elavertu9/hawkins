// Recipes with more than one way to cook them (methods:): the "Cook it" switch,
// the steps and times that follow it, ?method=, and a choice that's remembered.
import { open } from "./lib.mjs";

const { send, ev, go, until, sleep, check, shot, errors, finish } = await open();
const q = ev;
const slug = "/recipes/hearty-six-can-chili/";
const visibleSteps = "[...document.querySelectorAll('.steps:not([hidden]) .step__title')].map(e => e.textContent.trim()).join(' | ')";
const pressed = "[...document.querySelectorAll('.methods [data-method]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()).join()";
const stat = (name) => `document.querySelector('[data-stat="${name}"]').textContent.trim()`;

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go(slug);
await q("localStorage.clear()"); await go(slug);

check(`switch shows, first method chosen: ${await q(pressed)}`, (await q(pressed)) === "Stovetop" && await q("!document.querySelector('[data-methods]').hidden"));
check(`stovetop steps, 4 of them, times 10 + 40: ${await q(visibleSteps)}`,
  (await q(visibleSteps)).endsWith("Simmer") && (await q("document.querySelector('[data-steps-count]').textContent")) === "4 steps" && (await q(stat("cook"))) === "40 min");
check("only one list of steps is visible", (await q("document.querySelectorAll('.steps:not([hidden])').length")) === 1);
await shot("methods-stovetop-mobile");

// Tick a step, then switch: the other list shows and old progress doesn't carry over.
await q("document.querySelector('.steps:not([hidden]) .step__num').click()");
await q("document.querySelector('.methods [data-method=\"slow-cooker\"]').click()");
await sleep(300);
await until("document.readyState === 'complete' && document.querySelector('.methods [data-method=\"slow-cooker\"][aria-pressed=\"true\"]')", 8000);
check(`Slow cooker -> ${await q(pressed)}: ${await q(visibleSteps)}`, (await q(pressed)) === "Slow cooker" && (await q(visibleSteps)).endsWith("Cook"));
check(`its own times: cook ${await q(stat("cook"))}, total ${await q(stat("total"))}`, (await q(stat("cook"))) === "4 hr" && (await q(stat("total"))) === "4 hr 10 min");
check("step progress started fresh", (await q("document.querySelectorAll('.steps:not([hidden]) .step.is-done').length")) === 0);
await shot("methods-slow-cooker-mobile");

// Cook mode walks the chosen method's steps.
await q("document.querySelector('[data-cook]').click()");
await until("document.querySelector('.cook').open");
check(`cook mode counts the slow cooker's steps: ${await q("document.querySelector('[data-cook-count]').textContent")}`, (await q("document.querySelector('[data-cook-count]').textContent")) === "Step 1 of 4");
await q("document.querySelector('[data-cook-close]').click()"); await sleep(300);

// Remembered across visits, and ?method= wins for a shared link.
await go(slug);
check(`remembered: ${await q(pressed)}`, (await q(pressed)) === "Slow cooker");
await go(slug + "?method=stovetop");
check(`?method=stovetop: ${await q(pressed)}`, (await q(pressed)) === "Stovetop" && (await q(visibleSteps)).endsWith("Simmer"));
await go(slug + "?method=nonsense");
check(`unknown ?method falls back: ${await q(pressed)}`, (await q(pressed)) === "Slow cooker");

// A recipe with one method has no switch.
await go("/recipes/banana-bread/");
check("no switch on a one-method recipe", await q("!document.querySelector('[data-methods]')"));

check(`no page errors: ${errors.length}`, errors.length === 0);
finish();
