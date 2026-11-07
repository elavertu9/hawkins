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
for (let n = 0; n < 4; n++) await touch(tap[0] + n * 5, tap[1], tap[0] + n * 5, tap[1]);
await sleep(1200);
check("4 quick taps in one spot do nothing now (cook mode's page-turn taps)", !(await ev(flipped)));
for (let n = 0; n < 8; n++) await touch(tap[0], tap[1], tap[0], tap[1]);
await sleep(1200);
check("nor do 8", !(await ev(flipped)));
// Two fingers turning around a point: from `from` to `to` degrees, in small steps.
const twist = async (from, to, steps = 12) => {
  const cx = 195, cy = 420, r = 90;
  const points = (deg) => { const a = (deg * Math.PI) / 180; return [{ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), id: 1 }, { x: cx - r * Math.cos(a), y: cy - r * Math.sin(a), id: 2 }]; };
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
  for (let i = 1; i <= steps; i++) await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from + ((to - from) * i) / steps) });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(1200);
};
await twist(0, 40);
check("a pinch that turns a little does nothing", !(await ev(flipped)));
await twist(0, 100);
check("a quarter turn does nothing", !(await ev(flipped)));
await twist(0, 180);
check("a two-finger twist, half a turn, flips", await ev(flipped));
check("no horizontal overflow", await ev("document.documentElement.scrollWidth <= document.documentElement.clientWidth"));
await sleep(400); await shot("ud-index-mobile");
await twist(160, -20); // the other way, across the -180/180 line
check("twisting again (either way) flips back", !(await ev(flipped)));
check("no JS errors " + JSON.stringify(errors), errors.length === 0);
finish();
