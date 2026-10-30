// The "Surprise me" random recipe button.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const path = "location.pathname";
for (const [w, h, mobile, label] of [[1280, 900, false, "desktop"], [390, 844, true, "mobile"]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await go("/recipes/");
  check(`${label}: button visible`, await ev("document.querySelector('[data-random]').offsetParent !== null"));
  check(`${label}: no overflow`, await ev("document.documentElement.scrollWidth <= document.documentElement.clientWidth"));
  await shot(`gate-${label}`);
}
const seen = new Set();
for (let i = 0; i < 6; i++) {
  await go("/recipes/?category=soup");
  await ev("document.querySelector('[data-random]').click()"); await sleep(1200);
  seen.add(await ev(path));
}
const soups = (await (await fetch(BASE + "/recipes/")).text()).match(/data-category="soup"/g).length - 1;
check(`soup filter -> only soups: ${[...seen].join(" ")}`, [...seen].every((p) => p.startsWith("/recipes/")) && seen.size > 1);
await go("/recipes/?category=soup");
const soupLinks = await ev("[...document.querySelectorAll('.card:not([hidden]) .card__link')].map(a => new URL(a.href).pathname)");
check(`all picks are soups (${soupLinks.length})`, [...seen].every((p) => soupLinks.includes(p)));
// Single match: always that recipe even if it was last.
for (let i = 0; i < 2; i++) {
  await go("/recipes/?q=lobster");
  await ev("document.querySelector('[data-random]').click()"); await sleep(1200);
  check(`single match -> ${await ev(path)}`, (await ev(path)) === "/recipes/lobster-bisque/");
}
// Back button resets the label.
await send("Runtime.evaluate", { expression: "history.back()" }); await sleep(1500);
check(`after back, label: ${await ev("document.querySelector('[data-random]').textContent")}`, (await ev("document.querySelector('[data-random]').textContent")) === "Surprise me");
check(`JS errors: ${errors.length}`, errors.length === 0);
finish();
