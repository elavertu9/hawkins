// The "you probably have" pantry summary on the shopping list.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
await send("Browser.grantPermissions", { origin: BASE, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
await send("Page.bringToFront");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go("/plan/"); await ev("localStorage.clear()");
await ev(`localStorage.setItem('hawkins:plan', JSON.stringify({recipes: [{slug:'beef-and-broccoli',scale:1},{slug:'goulash',scale:2},{slug:'banana-bread',scale:1}], checked: []}))`);
await go("/plan/");
const summary = await ev("document.querySelector('[data-plan-pantry-summary-text]').textContent");
check(`summary: ${summary}`, /^Skipping \d+ you probably have: .*olive oil \(¼ cup\)/.test(summary));
await ev("document.querySelector('.shopping').scrollIntoView()"); await sleep(200);
await shot("pantry-summary");
await ev("document.querySelector('[data-plan-pantry-review]').click()"); await sleep(800);
const top = await ev("document.querySelector('.pantry').getBoundingClientRect().top");
console.log("scrollY", await ev("scrollY"), "max", await ev("document.documentElement.scrollHeight - innerHeight"));
check(`review opens + scrolls: open=${await ev("document.querySelector('.pantry').open")} top=${Math.round(top)}`, (await ev("document.querySelector('.pantry').open")) && top >= 0 && (top < 200 || (await ev("scrollY")) >= (await ev("document.documentElement.scrollHeight - innerHeight")) - 2));
await send("Runtime.evaluate", { expression: "document.querySelector('[data-plan-copy]').click()", userGesture: true }); await sleep(400);
const text = await ev("navigator.clipboard.readText()");
const last = text.trim().split("\n").pop();
check(`copy ends with: ${last}`, last.startsWith("Probably have: ") && last.includes("olive oil (¼ cup)"));
// No pantry items -> summary hidden
await ev("localStorage.setItem('hawkins:pantry', '[]')"); await go("/plan/");
check("no pantry -> summary hidden", await ev("document.querySelector('[data-plan-pantry-summary]').hidden"));
check(`JS errors: ${errors.length}`, errors.length === 0);
finish();
