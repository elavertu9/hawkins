// Classified recipes: locked pages, unlocking, Lock, and that the readable
// recipe never shows up in the built site. Reads the code from .classified-code
// and the readable copies from _classified/, so neither ends up in this file.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BASE, CODE, open } from "./lib.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const CLASSIFIED = join(ROOT, "_classified");
if (!CODE || !existsSync(CLASSIFIED)) {
  console.log("SKIP no .classified-code or _classified/ on this machine");
  process.exit(0);
}
const slugs = readdirSync(CLASSIFIED).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));

// Letters and digits only, so markup, entities, and line breaks don't matter.
const squash = (text) => text.toLowerCase().replace(/&[a-z#0-9]+;/g, "").replace(/[^a-z0-9]/g, "");

// Each readable recipe's summary and step text, which only the real recipe has.
const secrets = slugs.flatMap((slug) => {
  const text = readFileSync(join(CLASSIFIED, `${slug}.md`), "utf8");
  const blocks = [...text.matchAll(/^\s*(?:summary|text): >-?\n((?:\s{4,}.*\n)+)/gm)].map((m) => m[1]);
  return blocks.map((b) => squash(b).slice(0, 40)).filter((s) => s.length >= 30).map((s) => ({ slug, s }));
});

const { ev, go, sleep, check, shot, errors, finish, send } = await open();

// 1. Nothing readable anywhere in the built site.
const files = [];
const walk = (dir) => readdirSync(dir).forEach((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) walk(p); else if (/\.(html|xml|json|txt|js)$/.test(f)) files.push(p);
});
walk(join(ROOT, "_site"));
const leaks = secrets.filter(({ s }) => files.some((f) => squash(readFileSync(f, "utf8")).includes(s)));
check(`no readable text in _site (${secrets.length} passages, ${files.length} files): ${leaks.map((l) => l.slug).join(", ") || "none"}`, secrets.length > 0 && leaks.length === 0);

const steps = "document.querySelectorAll('.step').length";
const submitCode = async (code) => {
  await ev(`(() => { const i = document.querySelector('[data-classified-input]'); i.value = ${JSON.stringify(code)}; i.form.requestSubmit(); })()`);
  await sleep(1500);
};
const [first, second] = slugs;

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go(`/recipes/${first}/`); await ev("localStorage.clear()"); await go(`/recipes/${first}/`);
check(`locked: form shown, ${await ev(steps)} steps`, (await ev("!document.querySelector('[data-classified-form]').hidden")) && (await ev(steps)) === 0);
await shot("classified-locked");

await submitCode("not the code");
check(`wrong code: "${await ev("document.querySelector('[data-classified-error]').textContent")}"`, /Access denied/.test(await ev("document.querySelector('[data-classified-error]').textContent")));

// Case and extra spaces don't matter.
await submitCode(`  ${CODE.toUpperCase()}  `);
const opened = await ev(steps);
check(`right code (any case/spacing) opens it: ${opened} steps`, opened > 0 && (await ev("document.querySelectorAll('.ingredients .checklist li').length")) > 0);
await sleep(500);
await ev("document.querySelector('.ingredients .checklist input').click()"); await sleep(100);
check("recipe.js runs after unlocking (checkbox saved)", await ev(`localStorage.getItem('hawkins:recipe:${first}') !== null`));
await ev("document.querySelector('[data-cook]').click()"); await sleep(400);
check("cook mode opens", await ev("document.querySelector('.cook').open"));
await ev("document.querySelector('.cook').close()"); await sleep(300);

if (second) {
  await go(`/recipes/${second}/`);
  check(`another classified file opens on its own: ${await ev(steps)} steps`, (await ev(steps)) > 0);
}
await go(`/recipes/${first}/`);
check("reload stays open", (await ev(steps)) === opened);

await go("/recipes/");
check(`cards: no stamp once unlocked`, (await ev("[...document.querySelectorAll('.card__stamp')].every(s => getComputedStyle(s).display === 'none')")));
await go(`/recipes/${first}/`);
await ev("document.querySelector('.classified__bar button').click()"); await sleep(1500);
check("Lock locks it again and forgets the code", (await ev(steps)) === 0 && (await ev("localStorage.getItem('hawkins:clearance-code')")) === null);

await ev("localStorage.setItem('hawkins:clearance-code', 'old code')"); await go(`/recipes/${second || first}/`);
check("a stale saved code is forgotten", (await ev("!document.querySelector('[data-classified-form]').hidden")) && (await ev("localStorage.getItem('hawkins:clearance-code')")) === null);

await go("/recipes/");
const cardPlans = "[...document.querySelectorAll('.card--classified .card__plan')]";
const cards = await ev("[...document.querySelectorAll('.card--classified')].map(c => ({ meta: !!c.querySelector('.card__meta'), plan: !c.querySelector('.card__plan').hidden, stamp: getComputedStyle(c.querySelector('.card__stamp')).display !== 'none' }))");
check(`cards: ${cards.length} classified, stamped, no time or + Plan`, cards.length === slugs.length && cards.every((c) => c.stamp && !c.meta && !c.plan));
const options = `${JSON.stringify(slugs)}.filter(s => document.querySelector('[data-plan-select] option[value="' + s + '"]')).length`;
await go("/plan/"); await sleep(300);
check("locked: not in the plan's Add a recipe list", (await ev(options)) === 0);

// ---------- The meal plan, with the code ----------
const planned = "(JSON.parse(localStorage.getItem('hawkins:plan')) || { recipes: [] }).recipes";
await go(`/recipes/${first}/`);
check("locked recipe page: no + Add to meal plan", await ev("!document.querySelector('.button--plan') || document.querySelector('.button--plan').hidden"));
await submitCode(CODE);
check(`unlocked: + Add to meal plan shows: "${await ev("document.querySelector('.button--plan').textContent")}"`, await ev("!document.querySelector('.button--plan').hidden"));
await ev("document.querySelector('.button--plan').click()"); await sleep(200);
check(`adds it, marked classified: ${await ev(`JSON.stringify(${planned})`)}`, await ev(`${planned}.some(r => r.slug === '${first}' && r.classified)`) && (await ev("document.querySelector('.button--plan').textContent")) === "✓ In meal plan");
check("header count", (await ev("document.querySelector('[data-plan-count]').textContent")) === "1");
await go("/recipes/");
check("unlocked: classified cards show + Plan", await ev(`${cardPlans}.every(b => !b.hidden)`) && (await ev(`${cardPlans}.find(b => b.dataset.planAdd === '${first}').textContent`)) === "✓ Planned");
await go("/plan/"); await sleep(1500); // works out the key
check(`plan page lists it: ${await ev("[...document.querySelectorAll('.plan-item__title')].map(a => a.textContent).join()")}`, (await ev("document.querySelectorAll('.plan-item').length")) === 1);
check(`and its ingredients: ${await ev("document.querySelectorAll('[data-plan-aisles] li').length")} rows`, (await ev("document.querySelectorAll('[data-plan-aisles] li').length")) > 0);
check(`all ${slugs.length} in Add a recipe, the planned one greyed`, (await ev(options)) === slugs.length && await ev(`document.querySelector('[data-plan-select] option[value="${first}"]').disabled`));
await shot("classified-plan");
if (second) {
  await ev(`(() => { const s = document.querySelector('[data-plan-select]'); s.value = '${second}'; s.dispatchEvent(new Event('change')); })()`); await sleep(300);
  check("add another from the list", await ev(`${planned}.some(r => r.slug === '${second}' && r.classified)`) && (await ev("document.querySelectorAll('.plan-item').length")) === 2);
}
await ev(`localStorage.setItem('hawkins:plan', JSON.stringify({ recipes: [...${planned}, { slug: 'goulash', scale: 1 }], checked: [], extras: [] }))`);

// Sharing leaves them out, after saying so.
const tap = (js) => send("Runtime.evaluate", { expression: js, userGesture: true });
await send("Browser.grantPermissions", { origin: BASE, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
await send("Emulation.setFocusEmulationEnabled", { enabled: true }); // the clipboard needs a focused page
const held = "document.querySelector('[data-plan-held-dialog]')";
await go("/plan/"); await sleep(1500);
const classifiedTitles = await ev(`${JSON.stringify(slugs)}.map(s => document.querySelector('[data-plan-select] option[value="' + s + '"]').text)`);
await ev("Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })"); // copy instead of the share sheet
await tap("document.querySelector('[data-plan-share=\"list\"]').click()"); await sleep(300);
check(`Share asks first: "${await ev(`${held}.querySelector('h2').textContent`)}"`, await ev(`${held}.open`) && (await ev(`${held}.querySelector('h2').textContent`)).includes(classifiedTitles[0]));
await shot("classified-share-ask");
await tap("document.querySelector('[data-plan-held-share]').click()"); await sleep(400);
const sharedText = await ev("navigator.clipboard.readText()");
check(`shares the rest: ${JSON.stringify(sharedText.split("\n")[0])}, ${sharedText.match(/^The plan: (\S+)$/m)?.[1]}`,
  !(await ev(`${held}.open`)) && sharedText.includes("Goulash") && /\?r=goulash$/m.test(sharedText) && !classifiedTitles.some((t) => sharedText.includes(t)) && !slugs.some((s) => sharedText.includes(s)));
await tap("document.querySelector('[data-plan-held-cancel]').click()");
await ev(`localStorage.setItem('hawkins:plan', JSON.stringify({ recipes: ${planned}.filter(r => r.classified), checked: [], extras: [] }))`);
await go("/plan/"); await sleep(1500);
await tap("document.querySelector('[data-plan-share=\"link\"]').click()"); await sleep(300);
check(`only classified: "${await ev(`${held}.querySelector('h2').textContent`)}", OK only`, (await ev(`${held}.querySelector('h2').textContent`)) === "Classified recipes can't be shared"
  && await ev("document.querySelector('[data-plan-held-share]').hidden") && (await ev("document.querySelector('[data-plan-held-cancel]').textContent")) === "OK");
await tap("document.querySelector('[data-plan-held-cancel]').click()"); await sleep(200);
check("OK closes it", !(await ev(`${held}.open`)));
await ev(`localStorage.setItem('hawkins:plan', JSON.stringify({ recipes: [...${planned}, { slug: 'goulash', scale: 1 }], checked: [], extras: [] }))`);

// Lock: they leave the plan, and can't be added again.
await go(`/recipes/${first}/`);
await ev("document.querySelector('.classified__bar button').click()"); await sleep(1500);
check(`Lock takes them out of the plan: ${await ev(`JSON.stringify(${planned})`)}`, await ev(`${planned}.length === 1 && ${planned}[0].slug === 'goulash'`));
check("and the recipe page's button is gone", await ev("!document.querySelector('.button--plan') || document.querySelector('.button--plan').hidden"));
await go("/recipes/");
check("cards' + Plan hidden again", await ev(`${cardPlans}.every(b => b.hidden)`));
await go("/plan/"); await sleep(300);
check("and they're out of Add a recipe", (await ev(options)) === 0 && (await ev("document.querySelectorAll('.plan-item').length")) === 1);
await ev("localStorage.clear()");
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
