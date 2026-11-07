// The Upside Down easter egg.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const stepState = `[...document.querySelectorAll('.step')].map(s => s.classList.contains('is-done') ? 1 : 0).join('')`;
const checked = `document.querySelectorAll('.checklist input:checked').length`;

await go("/recipes/chicken-marsala/");
console.log("fresh page:", await ev(`({ resetHidden: document.querySelector('[data-reset]').hidden, steps: ${stepState} })`));

const key = async (k) => {
  const codes = { "0": 48, "1": 49, ArrowUp: 38 };
  const p = { key: k, code: k.length === 1 ? "Digit" + k : k, text: k.length === 1 ? k : undefined, windowsVirtualKeyCode: codes[k] };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...p });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...p });
};
const konami = async () => { for (const k of ["0","1","1"]) await key(k); await sleep(1200); };
const flipped = `document.documentElement.classList.contains('upside-down')`;

await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await go("/recipes/chicken-marsala/");
await ev("window.scrollTo(0, 300)");
await konami();
check("konami flips", await ev(flipped));
const max = await ev("document.documentElement.scrollHeight - innerHeight");
check(`scroll mirrored (${await ev("scrollY")} vs ${max - 300})`, Math.abs(await ev("scrollY") - (max - 300)) < 2);
check("toast shown", await ev(`document.querySelector('.upside-toast.is-shown')?.textContent || ''`) !== "");
await sleep(500); await shot("ud-recipe-desktop");
await go("/");
check("persists across pages", await ev(flipped));
check("starts at header (bottom)", Math.abs(await ev("scrollY") - await ev("document.documentElement.scrollHeight - innerHeight")) < 2);
const hdr = await ev("JSON.stringify(document.querySelector('.site-header').getBoundingClientRect())");
console.log("header rect", hdr);
await shot("ud-home-desktop");
await key("ArrowUp"); await key("ArrowUp"); await konami(); // stray keys first
check("konami flips back", !(await ev(flipped)));
check("session cleared", (await ev("sessionStorage.getItem('hawkins:upside-down')")) === null);

// Mobile touch gesture
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
await go("/recipes/");
const touch = async (x1, y1, x2, y2) => {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1 }] });
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x2, y: y2 }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(60);
};
const tap = await ev(`(() => { const r = document.querySelector('.page-title, h1').getBoundingClientRect(); return [r.left + 10, r.top + r.height/2]; })()`);
await touch(tap[0], tap[1], tap[0], tap[1]); await touch(tap[0], tap[1], tap[0], tap[1]);
await sleep(1200);
check("double tap does nothing", !(await ev(flipped)));
await touch(tap[0], tap[1], tap[0], tap[1]); await sleep(600);
await touch(tap[0], tap[1], tap[0], tap[1]); await touch(tap[0], tap[1], tap[0], tap[1]);
await sleep(1200);
check("slow taps do nothing", !(await ev(flipped)));
await sleep(600);
for (let n = 0; n < 3; n++) await touch(tap[0], tap[1], tap[0], tap[1]);
await sleep(1200);
check("triple tap does nothing", !(await ev(flipped)));
for (let n = 0; n < 4; n++) await touch(tap[0] + n * 50, tap[1], tap[0] + n * 50, tap[1]);
await sleep(1200);
check("4 taps in different spots do nothing", !(await ev(flipped)));
for (let n = 0; n < 5; n++) await touch(tap[0] + n * 5, tap[1], tap[0] + n * 5, tap[1]);
await sleep(1200);
check("5 quick taps in one spot do nothing", !(await ev(flipped)));
for (let n = 0; n < 6; n++) await touch(tap[0] + n * 5, tap[1], tap[0] + n * 5, tap[1]);
await sleep(1200);
check("6 quick taps in one spot flip", await ev(flipped));
check("no horizontal overflow", await ev("document.documentElement.scrollWidth <= document.documentElement.clientWidth"));
await sleep(400); await shot("ud-index-mobile");
// Flipped, the title is somewhere else on screen: tap it there.
const flippedTap = await ev(`(() => { const r = document.querySelector('.page-title, h1').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
for (let n = 0; n < 6; n++) await touch(flippedTap[0], flippedTap[1], flippedTap[0], flippedTap[1]);
await sleep(1200);
check("6 more flip back", !(await ev(flipped)));
// Cook mode: tapping the side of a step turns the page, so taps there never count.
await go("/recipes/beef-and-broccoli/");
await ev("document.querySelector('[data-cook]').click()"); await sleep(500);
const side = await ev("(() => { const r = document.querySelector('[data-cook-stage]').getBoundingClientRect(); return [r.left + r.width * 0.9, r.top + 40]; })()");
for (let n = 0; n < 6; n++) await touch(side[0], side[1], side[0], side[1]);
await sleep(1200);
check("6 quick taps in cook mode do nothing", !(await ev(flipped)));
check("no JS errors " + JSON.stringify(errors), errors.length === 0);
finish();
