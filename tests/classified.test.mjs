// Classified recipes: locked pages, unlocking, Lock, and that the readable
// recipe never shows up in the built site. Reads the code from .classified-code
// and the readable copies from _classified/, so neither ends up in this file.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CODE, open } from "./lib.mjs";

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
const cards = await ev("[...document.querySelectorAll('.card--classified')].map(c => ({ meta: !!c.querySelector('.card__meta'), plan: !!c.querySelector('.card__plan'), stamp: getComputedStyle(c.querySelector('.card__stamp')).display !== 'none' }))");
check(`cards: ${cards.length} classified, stamped, no time or + Plan`, cards.length === slugs.length && cards.every((c) => c.stamp && !c.meta && !c.plan));
await go("/plan/");
check("meal plan leaves them out", await ev(`!${JSON.stringify(slugs)}.some(s => document.querySelector('option[value="' + s + '"]'))`));
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
