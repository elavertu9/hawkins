// Packing lists: the data, the trip setup, quantities, kits, check-offs and skips, how a row shows its state (no
// text tags), the one-column layout and sticky setup, the kit chips' counts, the toast and glow when a kit is
// added, the Extras kit, sharing, the header's Packing badge, and shared links.
import { readFileSync } from "node:fs";
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = ev;
await send("Browser.grantPermissions", { origin: BASE, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
await send("Page.bringToFront");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const fits = "document.documentElement.scrollWidth <= document.documentElement.clientWidth";
const KEY = "hawkins:packing";
const saved = () => q(`JSON.parse(localStorage.getItem('${KEY}'))`);
const fresh = async (path = "/packing/") => { await go("/packing/"); await q("localStorage.clear()"); await go(path); };
const kitIds = () => q("[...document.querySelectorAll('.pack-kit')].map(k => k.dataset.packKitId).join()");
const names = (kit) => q(`[...document.querySelectorAll('.pack-kit[data-pack-kit-id="${kit}"] .pack-row__name')].map(e => e.textContent)`);
const allNames = () => q("[...document.querySelectorAll('.pack-row__name')].map(e => e.textContent)");
const row = (name) => `[...document.querySelectorAll('.pack-row')].find(li => li.querySelector('.pack-row__name').textContent === ${JSON.stringify(name)})`;
const qtyOf = (name) => q(`(() => { const li = ${row(name)}; const e = li && li.querySelector('.qty'); return li ? (e.hidden ? '' : e.textContent) : null; })()`);
const count = (name) => q(`[...document.querySelectorAll('.pack-row__name')].filter(e => e.textContent === ${JSON.stringify(name)}).length`);
const kitOf = (name) => q(`(() => { const li = ${row(name)}; return li ? li.closest('.pack-kit').dataset.packKitId : null; })()`);
const chip = (id) => `document.querySelector('[data-pack-kit="${id}"]')`;
const pressed = () => q("[...document.querySelectorAll('[data-pack-kit]')].filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.packKit).join()");
const toastText = "document.querySelector('[data-pack-toast-text]').textContent";
const undo = async () => { await q("document.querySelector('[data-pack-toast-action]').click()"); await sleep(200); };
const days = () => q("document.querySelector('[data-pack-days-value]').textContent");
const summary = () => q("document.querySelector('[data-pack-summary-text]').textContent");
const tick = async (name) => { await q(`${row(name)}.querySelector('input').click()`); await sleep(200); };
const skip = async (name) => { await q(`${row(name)}.querySelector('.pack-row__skip').click()`); await sleep(200); };
const progress = () => q("document.querySelector('[data-pack-count]').textContent");
const fill = () => q("document.querySelector('[data-pack-bar-fill]').style.width");
const badge = "(() => { const b = document.querySelector('[data-packing-count]'); return b.hidden ? 'hidden' : b.textContent; })()";
const rowCount = () => q("document.querySelectorAll('.pack-row').length"); // every item on the list (the add row isn't one)
const folded = (kit) => q(`document.querySelector('[data-pack-kit-id=${kit}] .pack-kit__list').hidden`);
const kitCount = (kit) => q(`(() => { const c = document.querySelector('[data-pack-kit-id=${kit}] .pack-kit__count'); return c.hidden ? 'hidden' : c.textContent; })()`);
// A saved trip with just the fields a test cares about (packing.js fills in the rest).
const seed = (trip) => q(`localStorage.setItem('${KEY}', JSON.stringify(${JSON.stringify({ days: 3, kits: [], checked: [], skipped: [], extras: [], ...trip })}))`);
const key = (k, code, vk) => send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text: k === "Enter" ? "\r" : undefined });
// Types into the Extras row like a person would: focus, text, Enter.
const addExtra = async (text) => {
  await q("document.querySelector('[data-pack-extra-input]').focus()");
  if (text) await send("Input.insertText", { text });
  await key("Enter", "Enter", 13);
  await sleep(200);
};

// ---------- The data ----------
await fresh();
const data = await q("JSON.parse(document.getElementById('pack-data').textContent)");
const kitIdList = data.kits.map((k) => k.id);
check(`${data.kits.length} kits, ids unique`, new Set(kitIdList).size === kitIdList.length);
const items = data.kits.flatMap((k) => k.items.map((i) => ({ ...i, kit: k.id })));
check("every item has an id and a name, ids unique within a kit", items.every((i) => i.id && i.item) && data.kits.every((k) => new Set(k.items.map((i) => i.id)).size === k.items.length));
const byId = new Map();
items.forEach((i) => byId.set(i.id, [...(byId.get(i.id) || []), i]));
const dupes = [...byId.values()].filter((list) => list.length > 1);
check(`${dupes.length} items in several kits (${dupes.map((l) => l[0].id).join(", ")}) say the same thing everywhere`, dupes.every((list) => list.every((i) => i.item === list[0].item)));
check("a duplicate keeps the same flags everywhere", dupes.every((list) => list.every((i) => !!i.task === !!list[0].task && JSON.stringify(i.qty) === JSON.stringify(list[0].qty))));
const whens = items.filter((i) => i.when);
check(`when names real kits: ${whens.map((i) => `${i.id} ${i.when}`).join(", ")}`, whens.length === 1 && whens[0].id === "overcoat" && whens.every((i) => i.when.split("+").every((id) => kitIdList.includes(id))));
check("a to-do has no amount, and nothing is marked to grab last any more", items.every((i) => !(i.task && i.qty) && !("last" in i)));
check("quantities are well-formed", items.filter((i) => i.qty).every((i) => (i.qty.per_day > 0 || i.qty.plus > 0) && (i.qty.per_week === undefined || i.qty.per_week > 0) && (i.qty.max === undefined || i.qty.max >= 1) && (i.qty.plus === undefined || i.qty.plus >= 0)));
check(`${data.presets.length} presets only use real trip kits, 1 to 30 days`, data.presets.length === 5 && data.presets.every((p) => p.days >= 1 && p.days <= 30 && p.kits.every((id) => data.kits.find((k) => k.id === id && !k.core))));
check("every trip kit has a group, core kits don't", data.kits.every((k) => k.core ? !k.group : ["Getting there", "Weather", "Plans"].includes(k.group)));
check(`core kits: ${data.kits.filter((k) => k.core).map((k) => k.id)}`, data.kits.filter((k) => k.core).map((k) => k.id).join() === "clothes,toiletries,tech,wallet,before" && data.kits.filter((k) => !k.core).every((k) => !k.core));
check("no room sweep / Heading home data", !("sweep" in data));
check("before-you-go items are all to-dos", data.kits.find((k) => k.id === "before").items.every((i) => i.task));
check("nothing left out of scope crept in", !items.some((i) => /\bbras?\b|\bdresses\b|skirt|makeup|purse|menstrual|memory card|film|contact lens|contacts|emergency|banking/i.test(i.item)));
check("no kit turns itself on, and clothes scale without a cap", data.kits.every((k) => !k.auto_days) && data.kits.find((k) => k.id === "clothes").items.every((i) => !i.qty || i.qty.max === undefined));

// ---------- A fresh visit ----------
await fresh();
check(`core kits show, then the empty Extras: ${await kitIds()}`, (await kitIds()) === "clothes,toiletries,tech,wallet,before,extras");
check("trip kits are off", (await pressed()) === "" && (await q("document.querySelectorAll('[data-pack-kit]').length")) === 11);
check("no Not bringing line: the setup already shows what's off", await q("!document.querySelector('[data-pack-not], .pack-not')"));
check(`3 days by default: "${await days()}"`, (await days()) === "3 days");
check("setup open, nothing saved, URL clean", await q(`document.querySelector('[data-pack-summary]').hidden && !document.querySelector('[data-pack-setup-body]').hidden && localStorage.getItem('${KEY}') === null && location.search === ''`));
check(`eyebrow and title: ${await q("document.querySelector('.eyebrow').textContent")} / ${await q("document.querySelector('.page-title').textContent")}`, (await q("document.querySelector('.eyebrow').textContent")) === "File 002 · Field kit" && (await q("document.querySelector('.page-title').textContent")) === "Packing Lists");
check("no Leaving home: the progress bar goes straight into the kits", await q("!document.querySelector('[data-pack-door], [data-pack-walks], [data-pack-dialog]') && document.querySelector('[data-pack-bar]').nextElementSibling.matches('[data-pack-kits]')"));
check(`credit: "${await q("document.querySelector('.pack-credit').textContent")}"`, (await q("document.querySelector('.pack-credit a').href")) === "https://www.smartertravel.com/the-ultimate-packing-list/" && (await q("document.querySelector('.pack-credit').textContent")) === "Adapted from SmarterTravel's Ultimate Packing List.");
check("the credit comes right after the kits: no Heading home note", await q("document.querySelector('[data-pack-kits]').nextElementSibling.matches('.pack-credit') && !document.querySelector('.pack-home')"));
check("no footer row under the list: Start a new trip lives in the trip panel", await q("!document.querySelector('[data-pack-tools], [data-pack-finish]') && document.querySelector('[data-pack-setup-body]').contains(document.querySelector('[data-pack-trip-tools]'))"));
check("and it waits until there's a trip", await q("document.querySelector('[data-pack-trip-tools]').hidden"));
const groupRows = () => q("[...document.querySelectorAll('.pack-group')].map(g => g.querySelector('.pack-group__label').textContent + ': ' + [...g.querySelectorAll('[data-pack-kit]')].map(c => c.querySelector('.chip__name').textContent).join(', ')).join(' | ')");
check(`kits under three headings: ${await groupRows()}`, (await groupRows()) === "Getting there: Flying, Car, International | Weather: Warm, Cold, Snow, Rain | Plans: Beach / Pool, Hiking, Dressy, Laundry");
check("each row is a labelled group, after \"Pick all that apply\"", await q("[...document.querySelectorAll('.pack-chips')].every(c => c.getAttribute('role') === 'group' && document.getElementById(c.getAttribute('aria-labelledby'))?.classList.contains('pack-group__label')) && document.querySelector('.pack-setup__hint').textContent === 'Pick all that apply' && document.querySelector('.pack-setup__hint').nextElementSibling === document.querySelector('[data-pack-kit-chips]')"));
const quick = () => q("[...document.querySelectorAll('[data-pack-presets] a')].map(a => a.querySelector('.chip__name').textContent + ' ' + a.querySelector('.chip__count').textContent).join(', ')");
check(`Quick start comes first, each with its length: ${await quick()}`, (await quick()) === "Weekend drive 2 days, Beach week 7 days, International 7 days, Ski trip 5 days, Work trip 3 days"
  && await q("document.querySelector('.pack-setup__presets-label').textContent === 'Quick start' && document.querySelector('[data-pack-presets-block]').compareDocumentPosition(document.querySelector('.pack-days')) & Node.DOCUMENT_POSITION_FOLLOWING")
  && (await q("document.querySelector('.pack-setup__or').textContent")) === "or build your own");
await shot("packing-setup-new-mobile");
check("presets show while there's no trip, and there's no Start a new trip", await q("!document.querySelector('[data-pack-presets-block]').hidden && document.querySelector('[data-pack-trip-tools]').hidden"));
check(`progress with nothing decided: "${await progress()}"`, /^0 packed · \d+ to go$/.test(await progress()) && (await fill()) === "0%");
check("nothing saved yet, so no badge in the header", (await q(badge)) === "hidden" && (await q(`localStorage.getItem('${KEY}')`)) === null);
check("packing page fits at 390px", await q(fits));
await shot("packing-fresh-mobile");
check("header nav lists Packing Lists, current page", await q("[...document.querySelectorAll('.site-nav a')].some(a => a.textContent.trim() === 'Packing' && a.getAttribute('aria-current') === 'page')"));
await go("/");
check("home: Packing Lists is a live card", await q("[...document.querySelectorAll('.files .file__link')].some(a => a.textContent === 'Packing Lists' && a.getAttribute('href') === '/packing/')")
  && !(await q("[...document.querySelectorAll('.soon-list__item')].map(e => e.textContent).join()")).includes("Packing"));

// ---------- Presets ----------
await fresh();
const presetLinks = await q("[...document.querySelectorAll('[data-pack-presets] a')].map(a => a.getAttribute('href'))");
check(`preset links are plain: ${presetLinks.join(" ")}`, presetLinks.length === 5 && presetLinks.every((h, i) => h === `/packing/?d=${data.presets[i].days}&k=${data.presets[i].kits.join(",")}`));
for (const preset of data.presets) {
  await fresh(presetLinks[data.presets.indexOf(preset)]);
  const want = [...preset.kits].sort().join();
  const got = (await pressed()).split(",").sort().join();
  check(`${preset.name}: ${preset.days} days, kits ${got}`, got === want && (await days()) === `${preset.days} days`);
}
// Clicking one from the page (Turbo swaps the page in place).
await fresh();
await q("[...document.querySelectorAll('[data-pack-presets] a')].find(a => a.querySelector('.chip__name').textContent === 'Ski trip').click()"); await sleep(800);
check(`click Ski trip: ${await pressed()} | ${await q("location.search")}`, (await pressed()) === "car,cold,snow" && (await q("location.search")) === "?d=5&k=car,cold,snow");
check(`trip kits appear, in file order, Extras last: ${await kitIds()}`, (await kitIds()) === "clothes,toiletries,tech,wallet,before,car,cold,snow,extras");
await fresh("/packing/?d=7&k=flying,warm,swim");
check(`Beach week: setup stays open, "${await summary()}" waits for Hide (not "Done", which reads like the trip's over)`, (await summary()) === "7 days · Flying · Warm · Beach / Pool"
  && await q("document.querySelector('[data-pack-summary]').hidden && !document.querySelector('[data-pack-setup-body]').hidden && !document.querySelector('[data-pack-summary-done]').hidden && document.querySelector('[data-pack-summary-done]').textContent === 'Hide'"));
check(`URL kept in sync: ${await q("location.search")}`, (await q("location.search")) === "?d=7&k=flying,warm,swim");
check("a trip from a link is saved, setup open", (await saved()).days === 7 && (await saved()).kits.join() === "flying,warm,swim" && (await saved()).setupFolded === false);
await go("/packing/");
check("a returning trip's setup is open too", await q("!document.querySelector('[data-pack-setup-body]').hidden && document.querySelector('[data-pack-summary]').hidden"));
await shot("packing-setup-open-mobile");
check("setup fits", await q(fits));
await q("document.querySelector('[data-pack-summary-done]').click()"); await sleep(200);
check(`Hide folds it into one line, and remembers: setupFolded ${(await saved()).setupFolded}`, await q("document.querySelector('[data-pack-setup-body]').hidden && !document.querySelector('[data-pack-summary]').hidden && document.activeElement === document.querySelector('[data-pack-summary]')") && (await saved()).setupFolded === true);
await shot("packing-beach-week-mobile");
await go("/packing/");
check(`reload: still folded, URL ${await q("location.search")}`, await q("document.querySelector('[data-pack-setup-body]').hidden && !document.querySelector('[data-pack-summary]').hidden") && (await q("location.search")) === "?d=7&k=flying,warm,swim");
await q("document.querySelector('[data-pack-summary]').click()"); await sleep(200);
check("Edit opens it, and that's remembered too", await q("!document.querySelector('[data-pack-setup-body]').hidden && !document.querySelector('[data-pack-summary-done]').hidden && document.querySelector('[data-pack-summary]').hidden") && (await saved()).setupFolded === false);
await go("/packing/");
check("reload: open again", await q("!document.querySelector('[data-pack-setup-body]').hidden"));
// With a trip, the presets are gone and Start a new trip clears it (with Undo) to bring them back.
check("a trip hides the presets; Start a new trip is there", await q("document.querySelector('[data-pack-presets-block]').hidden && !document.querySelector('[data-pack-trip-tools]').hidden && !document.querySelector('[data-pack-new]').hidden && document.querySelector('[data-pack-new]').textContent === 'Start a new trip'"));
await tick("Underwear");
await q("document.querySelector('[data-pack-new]').click()"); await sleep(200);
check(`Start a new trip clears it: storage ${await q(`localStorage.getItem('${KEY}')`)}, URL "${await q("location.search")}", ${await days()}, toast "${await q(toastText)}"`,
  (await q(`localStorage.getItem('${KEY}')`)) === null && (await q("location.search")) === "" && (await days()) === "3 days" && (await pressed()) === "" && (await q(toastText)) === "Trip cleared");
check("the presets are back, focused, and the trip buttons are gone", await q("!document.querySelector('[data-pack-presets-block]').hidden && document.activeElement === document.querySelector('[data-pack-presets] a') && document.querySelector('[data-pack-trip-tools]').hidden"));
await shot("packing-presets-revealed-mobile");
check("with the presets out, it fits", await q(fits));
await undo();
check(`Undo brings the trip back: ${await pressed()}, ${(await saved()).checked}`, (await pressed()) === "flying,warm,swim" && (await saved()).checked.join() === "underwear" && (await q("location.search")) === "?d=7&k=flying,warm,swim");
await q("document.querySelector('[data-pack-new]').click()"); await sleep(200);
await q("[...document.querySelectorAll('[data-pack-presets] a')].find(a => a.querySelector('.chip__name').textContent === 'Ski trip').click()"); await sleep(800);
check(`picking one starts that trip (${await pressed()}), with nothing checked, and the presets are tucked away again`, (await pressed()) === "car,cold,snow" && (await saved()).checked.length === 0 && await q("document.querySelector('[data-pack-presets-block]').hidden && !document.querySelector('[data-pack-new]').hidden"));

// ---------- Quantities ----------
await fresh("/packing/?d=3");
const qtys = async () => [await qtyOf("Underwear"), await qtyOf("Socks"), await qtyOf("T-shirts"), await qtyOf("Pants / jeans"), await qtyOf("Sweatshirt")].join(" ");
check(`3 days: ${await qtys()}`, (await qtys()) === "×4 ×4 ×4 ×2 ");
await fresh("/packing/?d=14");
check(`14 days, no cap: ${await qtys()}`, (await qtys()) === "×17 ×17 ×15 ×5 ");
await fresh("/packing/?d=7");
check(`7 days: a spare plus one more for the week: ${await qtys()}`, (await qtys()) === "×9 ×9 ×8 ×3 ");
await fresh("/packing/?d=1&k=warm");
check(`1 day: ${await qtys()}, shorts ${await qtyOf("Shorts")}`, (await qtys()) === "×2 ×2 ×2 ×1 " && (await qtyOf("Shorts")) === "×1");
await fresh("/packing/?d=5&k=warm");
check(`5 days: ${await qtys()}, shorts ${await qtyOf("Shorts")}`, (await qtys()) === "×6 ×6 ×6 ×2 " && (await qtyOf("Shorts")) === "×3");
await fresh("/packing/?d=30&k=warm");
check(`30 days: shorts ${await qtyOf("Shorts")}, underwear ${await qtyOf("Underwear")}`, (await qtyOf("Shorts")) === "×15" && (await qtyOf("Underwear")) === "×35");
check("an item without a quantity shows no number", (await qtyOf("Sandals")) === "" && (await qtyOf("Toothbrush")) === "");
// The stepper does the same, and stops at 1 and 30.
await fresh();
for (let i = 0; i < 11; i++) await q("document.querySelector('[data-pack-days=\"1\"]').click()");
check(`stepper to 14: "${await days()}", underwear ${await qtyOf("Underwear")}`, (await days()) === "14 days" && (await qtyOf("Underwear")) === "×17");
check("URL follows the stepper", (await q("location.search")) === "?d=14");
for (let i = 0; i < 40; i++) await q("document.querySelector('[data-pack-days=\"1\"]').click()");
check(`stepper stops at 30: "${await days()}", + disabled ${await q("document.querySelector('[data-pack-days=\"1\"]').disabled")}`, (await days()) === "30 days" && await q("document.querySelector('[data-pack-days=\"1\"]').disabled"));
for (let i = 0; i < 40; i++) await q("document.querySelector('[data-pack-days=\"-1\"]').click()");
check(`stepper stops at 1: "${await days()}", − disabled ${await q("document.querySelector('[data-pack-days=\"-1\"]').disabled")}`, (await days()) === "1 day" && await q("document.querySelector('[data-pack-days=\"-1\"]').disabled"));
await fresh("/packing/?d=999&k=nonsense,car");
check(`a silly link is tamed: ${await days()}, ${await pressed()}`, (await days()) === "30 days" && (await pressed()) === "car");

// ---------- Laundry ----------
// You pack for every day; the Laundry kit is there only if you turn it on.
await fresh("/packing/?d=14");
check(`14 days: no Laundry kit unless you ask (${await pressed() || "none"})`, (await pressed()) === "" && (await count("Laundry kit (detergent pods, stain stick)")) === 0);
await q(`${chip("laundry")}.click()`); await sleep(200);
check(`toggle it on: kit shows ${await kitIds()}`, (await pressed()) === "laundry" && (await kitIds()).endsWith(",laundry,extras") && (await count("Laundry kit (detergent pods, stain stick)")) === 1);
await q(`${chip("laundry")}.click()`); await sleep(200);
check(`and off: toast "${await q(toastText)}"`, (await pressed()) === "" && (await kitIds()) === "clothes,toiletries,tech,wallet,before,extras");
await undo();
check("Undo turns it back on", (await pressed()) === "laundry");
check("Laundry bag is core, always there", (await count("Laundry bag")) === 1);

// ---------- Duplicates and the AND rule ----------
await fresh("/packing/?d=3&k=warm,swim,hiking");
check(`Sunscreen shows once, under ${await kitOf("Sunscreen")}`, (await count("Sunscreen")) === 1 && (await kitOf("Sunscreen")) === "warm");
check(`Extra socks: once, ${await qtyOf("Extra socks")}, under ${await kitOf("Extra socks")}`, (await count("Extra socks")) === 1 && (await qtyOf("Extra socks")) === "×2" && (await kitOf("Extra socks")) === "swim");
// Change of clothes is a plain Flying item, counted like the rest. No liquids bag: the TSA tips cover it.
await fresh("/packing/?d=3&k=flying");
check(`Change of clothes: a plain row, no number, Flying counts ${await kitCount("flying")}`, (await count("Change of clothes")) === 1 && (await qtyOf("Change of clothes")) === ""
  && (await kitCount("flying")) === `0/${data.kits.find((k) => k.id === "flying").items.length}` && (await count("Liquids bag (3-1-1)")) === 0);
check("no item or kit is optional any more", !data.kits.some((k) => k.items.some((i) => "optional" in i)));
await tick("Change of clothes");
check(`ticking it counts: ${await kitCount("flying")}`, (await kitCount("flying")).startsWith("1/") && (await saved()).progress.packed === 1);
// The TSA tips: folded under Flying's list, open across a redraw, linking to tsa.gov.
const tips = "document.querySelector('[data-pack-kit-id=flying] .pack-tips')";
check(`TSA tips under Flying: "${await q(`${tips}?.querySelector('summary').textContent`)}", folded`, (await q(`${tips}.querySelector('summary').textContent`)) === "TSA rules, briefly" && (await q(`${tips}.open`)) === false
  && (await q(`${tips}.previousElementSibling.classList.contains('pack-kit__list')`)) && (await q("document.querySelectorAll('.pack-kit .pack-tips').length")) === 1);
check("its links go to tsa.gov", (await q(`[...${tips}.querySelectorAll('a')].map(a => a.hostname).join()`)) === "www.tsa.gov,www.tsa.gov" && (await q(`${tips}.querySelectorAll('li').length`)) === data.kits.find((k) => k.id === "flying").tips.items.length);
await q(`${tips}.querySelector('summary').click()`); await sleep(100);
await tick("Snacks");
check("opened, it stays open when you check something", (await q(`${tips}.open`)) === true);
await q(`${tips}.scrollIntoView({ block: "center" })`); await sleep(200);
await shot("packing-tsa-tips-mobile");
await q("document.querySelector('[data-pack-kit-id=flying] .pack-kit__head').click()"); await sleep(100);
check("folding Flying hides them too", (await q(`${tips}.hidden`)) === true);
await fresh("/packing/?d=3&k=car");
check("no tips without Flying", (await q("document.querySelectorAll('.pack-kit .pack-tips').length")) === 0);
await fresh("/packing/?d=3&k=dressy");
check(`Dressy has Undershirts: ${await names("dressy")}`, (await names("dressy")).join() === "Suit / blazer,Dress shirts,Undershirts,Dress pants,Tie,Dress shoes");
await fresh("/packing/?d=3&k=warm,swim,hiking");
check(`Sandals once under ${await kitOf("Sandals")}, Insect repellent once under ${await kitOf("Insect repellent")}`, (await count("Sandals")) === 1 && (await kitOf("Sandals")) === "warm" && (await count("Insect repellent")) === 1 && (await kitOf("Insect repellent")) === "swim");
check(`Hiking keeps its own: ${await names("hiking")}`, (await names("hiking")).join() === "Hiking boots,Daypack,Water bottle,First aid ointment");
await q(`${chip("warm")}.click()`); await sleep(200);
check(`Warm off: Sunscreen moves to ${await kitOf("Sunscreen")}`, (await count("Sunscreen")) === 1 && (await kitOf("Sunscreen")) === "swim");
await q(`${chip("swim")}.click()`); await sleep(200);
check(`Beach / Pool off: Sunscreen now under ${await kitOf("Sunscreen")}`, (await count("Sunscreen")) === 1 && (await kitOf("Sunscreen")) === "hiking");
// A tick on a shared item counts everywhere: it's keyed by id.
await fresh("/packing/?d=3&k=warm,swim");
await tick("Sunscreen");
await q(`${chip("warm")}.click()`); await sleep(200);
check("Sunscreen's tick follows it to the next kit", (await kitOf("Sunscreen")) === "swim" && await q(`${row("Sunscreen")}.querySelector('input').checked`));
await fresh("/packing/?d=3&k=cold");
check(`Cold alone: no Overcoat (${await names("cold")})`, (await count("Overcoat")) === 0 && (await names("cold")).join() === "Coat,Gloves,Scarf,Winter hat,Sweaters");
await fresh("/packing/?d=3&k=dressy");
check("Dressy alone: no Overcoat", (await count("Overcoat")) === 0);
await fresh("/packing/?d=3&k=cold,dressy");
check(`Cold + Dressy: Overcoat under ${await kitOf("Overcoat")}`, (await count("Overcoat")) === 1 && (await kitOf("Overcoat")) === "cold");
await q(`${chip("dressy")}.click()`); await sleep(200);
check("Dressy off: Overcoat goes", (await count("Overcoat")) === 0);

// ---------- Checking things off ----------
await fresh("/packing/?d=3&k=swim,rain");
const startCount = await progress();
const swimBefore = await names("swim");
const allBefore = await allNames();
await q(`${row("Swimsuit")}.querySelector('input').click()`); await sleep(150);
check(`a tick lands at once and the row stays put: ${await names("swim")}`, (await saved()).checked.join() === "swimsuit" && await q(`${row("Swimsuit")}.querySelector('input').checked`)
  && (await names("swim")).join() === swimBefore.join() && (await names("swim"))[0] === "Swimsuit" && (await allNames()).join() === allBefore.join());
check("no delay or leaving class is left on the row", await q(`!${row("Swimsuit")}.classList.contains('is-leaving')`));
check(`progress "${startCount}" -> "${await progress()}", kit count ${await kitCount("swim")}`, (await progress()).startsWith("1 packed · ") && !(await progress()).includes("skipped") && (await kitCount("swim")) === "1/7");
check("no toast for a tick, like the meal plan", await q("!document.querySelector('[data-pack-toast]').classList.contains('is-shown')"));
await shot("packing-checked-mobile");
await q(`${row("Swimsuit")}.querySelector('input').click()`); await sleep(150);
check("unticking works the same way, at once", (await saved()).checked.length === 0 && (await names("swim")).join() === swimBefore.join());
await tick("Swimsuit"); await tick("Sandals");
await go("/packing/");
check(`ticks survive a reload, in the same order: ${(await saved()).checked}`, await q(`${row("Swimsuit")}.querySelector('input').checked && ${row("Sandals")}.querySelector('input').checked`) && (await names("swim")).join() === swimBefore.join() && (await allNames()).join() === allBefore.join());
check("the bar shows how much is decided", await q("document.querySelector('[data-pack-bar]').getAttribute('aria-valuenow') > 0 && document.querySelector('[data-pack-bar-fill]').style.width !== '0%'"));
// A tick taken straight back leaves nothing saved.
await tick("Cover-up"); await tick("Cover-up");
check("tick, then untick: nothing saved", !(await saved()).checked.includes("cover-up"));
// A kit that's all packed stays open while you work, and is folded the next time you open the page.
check("Rain is open while it's not packed", !(await folded("rain")));
await tick("Umbrella");
check(`one of two packed: open, ${await kitCount("rain")}`, !(await folded("rain")) && (await kitCount("rain")) === "1/2");
await tick("Rain jacket");
check(`all packed: Rain stays open, ${await kitCount("rain")} with a tick`, !(await folded("rain")) && await q("document.querySelector('[data-pack-kit-id=rain]').classList.contains('is-complete') && getComputedStyle(document.querySelector('[data-pack-kit-id=rain] .pack-kit__tick')).display !== 'none'"));
check(`its rows haven't moved: ${await names("rain")}`, (await names("rain")).join() === "Umbrella,Rain jacket");
await q("document.querySelector('[data-pack-kit-id=rain]').scrollIntoView({ block: 'center' })"); await sleep(200);
await shot("packing-kit-complete-open-mobile");
await go("/packing/");
check("after a reload it's folded", await folded("rain") && await q("document.querySelector('[data-pack-kit-id=rain]').classList.contains('is-complete')"));
await shot("packing-kit-folded-mobile");
await q("document.querySelector('[data-pack-kit-id=rain] .pack-kit__head').click()"); await sleep(100);
check("tapping its name opens it", !(await folded("rain")) && await q("document.querySelector('[data-pack-kit-id=rain] .pack-kit__head').getAttribute('aria-expanded') === 'true'"));
await q("document.querySelector('[data-pack-kit-id=rain] .pack-kit__head').click()"); await sleep(100);
check("and folds it again", await folded("rain"));
await go("/packing/");
check("it stays folded after a reload", await folded("rain"));
await q("document.querySelector('[data-pack-kit-id=rain] .pack-kit__head').click()"); await sleep(100);
await tick("Umbrella");
check("unchecking one in a kit you opened: it stays open, no longer complete", !(await folded("rain")) && !(await q("document.querySelector('[data-pack-kit-id=rain]').classList.contains('is-complete')")));
await tick("Umbrella");
check("and checking it again doesn't fold it", !(await folded("rain")));
// Tasks look just like items: no number, no tag, struck through when done.
await q(`${row("Take out the trash")}.querySelector('input').click()`); await sleep(200);
check("task: ticks like an item, no number, no tag", (await qtyOf("Take out the trash")) === "" && (await saved()).checked.includes("take-out-trash")
  && await q(`getComputedStyle(${row("Take out the trash")}.querySelector('.check__text')).textDecorationLine === 'line-through' && getComputedStyle(${row("Set the thermostat")}.querySelector('.check__text')).textDecorationLine === 'none'`));
// ---------- Skipping ----------
// Not taking it this trip: a third state beside to pack and packed.
await fresh("/packing/?d=3&k=swim,rain");
const total = await rowCount();
check(`every item has a quiet Skip button: ${await q("document.querySelectorAll('.pack-row .pack-row__skip').length")} of ${total}`, (await q("document.querySelectorAll('.pack-row .pack-row__skip').length")) === total
  && await q("[...document.querySelectorAll('.pack-row .pack-row__skip')].every(b => b.textContent === 'Skip' && b.classList.contains('shopping__action') && b.getAttribute('aria-label') === 'Skip ' + b.closest('.pack-row').querySelector('.pack-row__name').textContent)"));
check("a row that isn't skipped isn't marked as skipped", await q(`!${row("Swimsuit")}.classList.contains('is-skipped')`));
await skip("Swimsuit");
check(`Skip: saved ${(await saved()).skipped}, the row is marked, the button says "${await q(`${row("Swimsuit")}.querySelector('.shopping__action').textContent`)}"`,
  (await saved()).skipped.join() === "swimsuit" && (await saved()).checked.length === 0
  && await q(`${row("Swimsuit")}.classList.contains('is-skipped') && ${row("Swimsuit")}.querySelector('.shopping__action').textContent === 'Bring' && ${row("Swimsuit")}.querySelector('.shopping__action').getAttribute('aria-label') === 'Bring Swimsuit'`));
check(`a skipped row stays where it is in its kit: ${await names("swim")}`, (await names("swim"))[0] === "Swimsuit" && !(await q(`${row("Swimsuit")}.querySelector('input').checked`)));
check(`it counts as decided: kit ${await kitCount("swim")}, "${await progress()}"`, (await kitCount("swim")) === "1/7" && (await progress()) === `0 packed · 1 skipped · ${total - 1} to go`);
check(`the bar counts it: ${await fill()}`, (await fill()) === `${Math.round((1 / total) * 100)}%` && (await q("document.querySelector('[data-pack-bar]').getAttribute('aria-valuetext')")) === `0 packed, 1 skipped, ${total - 1} to go`
  && (await q("document.querySelector('[data-pack-bar]').getAttribute('aria-valuenow')")) === String(Math.round((1 / total) * 100)));
check("no toast for a skip, like a tick", await q("!document.querySelector('[data-pack-toast]').classList.contains('is-shown')"));
// Packed and skipped rows stay in the list's order.
await tick("Sandals");
check(`order in the kit is the list's order: ${await names("swim")}`, (await names("swim")).join() === swimBefore.join());
await shot("packing-skipped-row-mobile");
await go("/packing/");
check("skips survive a reload", (await saved()).skipped.join() === "swimsuit" && await q(`${row("Swimsuit")}.classList.contains('is-skipped')`));
// Bring puts it back where it was.
await q(`${row("Swimsuit")}.querySelector('.pack-row__skip').click()`); await sleep(200);
check(`Bring un-skips: ${(await saved()).skipped.length} skipped, still at the top of the kit: ${(await names("swim"))[0]}`, (await saved()).skipped.length === 0 && (await names("swim"))[0] === "Swimsuit"
  && await q(`${row("Swimsuit")}.querySelector('.shopping__action').textContent === 'Skip'`) && (await progress()).startsWith("1 packed · ") && !(await progress()).includes("skipped"));
// Checking a skipped item packs it and drops the skip.
await skip("Collapsible tote"); await skip("Cover-up");
check(`two skipped: ${(await saved()).skipped}`, (await saved()).skipped.join() === "beach-tote,cover-up");
await tick("Collapsible tote");
check(`checking a skipped item packs it: checked ${(await saved()).checked}, skipped ${(await saved()).skipped}`, (await saved()).checked.includes("beach-tote") && (await saved()).skipped.join() === "cover-up"
  && await q(`${row("Collapsible tote")}.querySelector('input').checked && !${row("Collapsible tote")}.classList.contains('is-skipped')`));
check("a packed row has no Skip", await q(`!${row("Collapsible tote")}.querySelector('.pack-row__skip')`));
check("an item is never both packed and skipped", await q(`(() => { const s = JSON.parse(localStorage.getItem('${KEY}')); return s.checked.every(id => !s.skipped.includes(id)); })()`));
check(`progress with packed and skipped: "${await progress()}"`, (await progress()) === `2 packed · 1 skipped · ${total - 3} to go`);
// Ticking a skipped item packs it, and unticking it leaves it to pack (the skip doesn't come back).
await tick("Cover-up"); await tick("Cover-up");
check("tick, then untick a skipped item: neither packed nor skipped", !(await saved()).skipped.includes("cover-up") && !(await saved()).checked.includes("cover-up"));
// A tick lands at once, so a packed row has no Skip to race it.
await tick("Sunscreen");
check("a packed row has no Skip, and it's saved", (await saved()).checked.includes("sunscreen") && await q(`!${row("Sunscreen")}.querySelector('.pack-row__skip')`));
check("Extras have a × and no Skip", await (async () => { await addExtra("Camera"); return q(`${row("Camera")}.querySelector('.shopping__action--remove') !== null && ${row("Camera")}.querySelector('.pack-row__skip') === null`); })());

// A kit with every item decided counts as complete, packed or skipped. It stays open while you finish it, and is folded after a reload.
await fresh("/packing/?d=3&k=rain");
check("Rain is open", !(await folded("rain")));
await tick("Umbrella"); await tick("Extra socks");
check(`two of three packed: open, ${await kitCount("rain")}`, !(await folded("rain")) && (await kitCount("rain")) === "2/3");
await skip("Rain jacket");
check(`the other skipped: Rain stays open, ${await kitCount("rain")} with a tick`, !(await folded("rain")) && (await kitCount("rain")) === "3/3" && await q("document.querySelector('[data-pack-kit-id=rain]').classList.contains('is-complete') && getComputedStyle(document.querySelector('[data-pack-kit-id=rain] .pack-kit__tick')).display !== 'none'"));
check(`its label says so: ${await q("document.querySelector('[data-pack-kit-id=rain] .pack-kit__head').getAttribute('aria-label')")}`, (await q("document.querySelector('[data-pack-kit-id=rain] .pack-kit__head').getAttribute('aria-label')")) === "Rain, 3 of 3 decided, all done");
check(`rows in the list's order, Bring on the last: ${await names("rain")}`, (await names("rain")).join() === "Umbrella,Rain jacket,Extra socks" && await q(`${row("Rain jacket")}.querySelector('.shopping__action').textContent === 'Bring'`));
await go("/packing/");
check("after a reload it's folded", await folded("rain"));
await q("document.querySelector('[data-pack-kit-id=rain] .pack-kit__head').click()"); await sleep(100);
await q(`${row("Rain jacket")}.querySelector('.pack-row__skip').click()`); await sleep(200);
check("undoing the skip in a kit you opened keeps it open", !(await folded("rain")) && !(await q("document.querySelector('[data-pack-kit-id=rain]').classList.contains('is-complete')")));

// Progress text: leave out "skipped" at 0, and All set when nothing's left.
await fresh("/packing/?d=3&k=rain");
const shown = await q("[...document.querySelectorAll('.pack-row')].map(li => li.querySelector('.pack-row__name').textContent)");
const idOf = (name) => data.kits.flatMap((k) => k.items).find((i) => i.item === name).id;
const ids = shown.map(idOf);
await seed({ kits: ["rain"], checked: ids.slice(0, 5), skipped: ids.slice(5, 7) });
await go("/packing/");
check(`5 packed, 2 skipped of ${ids.length}: "${await progress()}"`, (await progress()) === `5 packed · 2 skipped · ${ids.length - 7} to go`
  && (await fill()) === `${Math.round((7 / ids.length) * 100)}%` && (await q("document.querySelector('[data-pack-bar]').getAttribute('aria-valuetext')")) === `5 packed, 2 skipped, ${ids.length - 7} to go`);
check(`the saved progress: ${JSON.stringify((await saved()).progress)}`, JSON.stringify((await saved()).progress) === JSON.stringify({ packed: 5, skipped: 2, total: ids.length }));
await seed({ kits: ["rain"], checked: ids.slice(0, 5), skipped: [] });
await go("/packing/");
check(`no skips: "${await progress()}"`, (await progress()) === `5 packed · ${ids.length - 5} to go`);
await seed({ kits: ["rain"], checked: ids.slice(0, 40), skipped: ids.slice(40) });
await go("/packing/");
check(`all decided: "${await progress()}", bar ${await fill()}, "${await q("document.querySelector('[data-pack-bar]').getAttribute('aria-valuetext')")}"`, (await progress()) === "All set" && (await fill()) === "100%"
  && (await q("document.querySelector('[data-pack-bar]').getAttribute('aria-valuetext')")) === "All set" && (await q("document.querySelector('[data-pack-bar]').getAttribute('aria-valuenow')")) === "100");
check("every kit folds, Extras (always open, for its add row) doesn't", await q("[...document.querySelectorAll('.pack-kit')].filter(k => k.dataset.packKitId !== 'extras').every(k => k.querySelector('.pack-kit__list').hidden && k.classList.contains('is-complete'))") && !(await folded("extras")));
await shot("packing-all-set-mobile");

// Nothing unchecks everything at once any more: Start a new trip is the one reset.
check("no Uncheck all / Start over / Pack this trip again", await q("!document.querySelector('[data-pack-uncheck]')"));

// ---------- Kits on and off ----------
await fresh("/packing/?d=3&k=car");
await q(`${chip("snow")}.click()`); await sleep(200);
check(`tapping Snow turns it on: ${await pressed()}`, (await pressed()) === "car,snow" && (await kitIds()).endsWith("car,snow,extras"));
check(`saved: ${(await saved()).kits}`, (await saved()).kits.join() === "car,snow");
await q(`${chip("snow")}.click()`); await sleep(200);
check(`Snow off: toast "${await q(toastText)}", kit gone`, (await q(toastText)) === "Snow is off" && (await kitIds()).endsWith(",car,extras"));
await undo();
check("Undo puts Snow back", (await pressed()) === "car,snow" && (await q("location.search")) === "?d=3&k=car,snow");

// ---------- How a row shows its state ----------
// No words: packed is the red ✓ and a line through the text, skipped a slashed circle and faded text.
// The checkbox's aria-label says it for screen readers. A row never changes height or moves.
await fresh("/packing/?d=3&k=flying,international,swim");
const css = (name, sel, prop, pseudo = "") => q(`getComputedStyle(${row(name)}.querySelector('${sel}')${pseudo ? `, '${pseudo}'` : ""}).${prop}`);
const label = (name) => q(`${row(name)}.querySelector('input').getAttribute('aria-label')`);
const rowBox = (name) => q(`(() => { const r = ${row(name)}.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), height: r.height }; })()`);
const allTops = () => q("[...document.querySelectorAll('.pack-row')].map(li => Math.round(li.getBoundingClientRect().top + scrollY) + ':' + li.getBoundingClientRect().height)");
const textTags = /to do|not taking|optional/i;
const noTags = () => q(`[...document.querySelectorAll('.pack-row')].every(li => !${textTags}.test(li.querySelector('.check__text').textContent)) && !document.querySelector('.pack-row__todo, .pack-row__optional, .pack-row__skipped')`);
check("no row says 'to do', 'not taking' or 'optional', and the old tag elements are gone", await noTags());
check("a task renders like an item: no tag, the same box", (await css("Check in online", ".check__box", "borderTopStyle")) === "solid" && await q(`!${row("Check in online")}.querySelector('.check__text').textContent.includes('to do')`));
check("no dashed boxes", (await css("Change of clothes", ".check__box", "borderTopStyle")) === "solid" && (await css("Snacks", ".check__box", "borderTopStyle")) === "solid");
check(`aria-labels carry the state: "${await label("Change of clothes")}" / "${await label("Check in online")}" / "${await label("Underwear")}"`,
  (await label("Change of clothes")) === null && (await label("Check in online")) === "Check in online, to do" && (await label("Underwear")) === "Underwear, 4" && (await label("Passport")) === null);
// Checking, skipping and bringing back, on short and long names: nothing moves, nothing grows.
for (const name of ["Swimsuit", "Change of clothes", "Check passport valid 6+ months out", "Laundry bag"]) {
  const tops = await allTops();
  const normal = await rowBox(name);
  await skip(name);
  const skipped = await rowBox(name);
  check(`${name}: skipped is the same height as unchecked (${normal.height}px)`, skipped.height === normal.height && skipped.top === normal.top && (await allTops()).join() === tops.join());
  await q(`${row(name)}.querySelector('.pack-row__skip').click()`); await sleep(150);
  check(`${name}: and back to unchecked`, (await allTops()).join() === tops.join());
}
await skip("Cover-up");
await skip("Change of clothes");
const lineOf = (name) => css(name, ".check__text", "textDecorationLine");
check("a skipped row: slashed circle, faded text, no strike-through, a Bring button", (await css("Cover-up", ".check__box", "borderTopLeftRadius")) === "50%"
  && (await css("Cover-up", ".check__box", "backgroundImage", "::after")).includes("linear-gradient") && (await css("Underwear", ".check__box", "borderTopLeftRadius")) !== "50%"
  && (await lineOf("Cover-up")) === "none" && (await css("Cover-up", ".pack-row__name", "color")) !== (await css("Underwear", ".pack-row__name", "color"))
  && (await q(`${row("Cover-up")}.querySelector('.shopping__action').textContent`)) === "Bring" && (await q(`${row("Cover-up")}.querySelector('.shopping__action').getAttribute('aria-label')`)) === "Bring Cover-up");
check("its box is not filled", (await css("Cover-up", ".check__box", "backgroundColor")) === "rgba(0, 0, 0, 0)" && (await css("Cover-up", ".check__box", "backgroundImage")) === "none");
check(`its label says so: "${await label("Cover-up")}", "${await label("Change of clothes")}"`, (await label("Cover-up")) === "Cover-up, not taking" && (await label("Change of clothes")) === "Change of clothes, not taking");
await tick("Sunscreen");
check("a packed row: red ✓, solid strike-through", (await lineOf("Sunscreen")) === "line-through" && (await css("Sunscreen", ".check__box", "backgroundColor")) !== "rgba(0, 0, 0, 0)"
  && (await css("Sunscreen", ".check__box", "borderTopLeftRadius")) !== "50%");
check("packed and skipped look different: line, box, shape", (await lineOf("Sunscreen")) !== (await lineOf("Cover-up")) && (await css("Sunscreen", ".check__box", "backgroundColor")) !== (await css("Cover-up", ".check__box", "backgroundColor")));
check("still no tags anywhere", await noTags());
check("packed and skipped are both counted", (await progress()).startsWith("1 packed · 2 skipped · ") && (await saved()).progress.packed === 1 && (await saved()).progress.skipped === 2);
await q("document.querySelector('[data-pack-kit-id=flying]').scrollIntoView({ block: 'start' })"); await sleep(200);
await shot("packing-row-states-mobile");
// At 360px, with the longest names.
await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await fresh("/packing/?d=3&k=flying,international,swim");
{
  const tops = await allTops();
  await skip("Check passport valid 6+ months out"); await skip("Check in online"); await skip("Change of clothes"); await skip("Boarding pass / itinerary");
  check("360px: skipping the long names changes no row's height or place", (await allTops()).join() === tops.join());
}
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// ---------- Kit chips: counts, the toast, and the glow ----------
const chipCount = (id) => q(`(() => { const c = ${chip(id)}.querySelector('.chip__count'); return c.hidden ? '' : c.textContent; })()`);
const chipLabel = (id) => q(`${chip(id)}.getAttribute('aria-label')`);
const toastAction = "document.querySelector('[data-pack-toast-action]')";
const glowing = () => q("[...document.querySelectorAll('.pack-kit.is-new')].map(k => k.dataset.packKitId).join()");
const tripItems = (kit) => data.kits.find((k) => k.id === kit).items;
await fresh("/packing/?d=3");
check(`counts with nothing on: Beach / Pool ${await chipCount("swim")}, Flying ${await chipCount("flying")}, Cold ${await chipCount("cold")}, Laundry ${await chipCount("laundry")}`,
  (await chipCount("swim")) === "+7" && (await chipCount("laundry")) === "+1" && (await chipCount("cold")) === "+5" && (await chipCount("dressy")) === "+6");
check("Flying adds all 12 of its items", tripItems("flying").length === 12 && (await chipCount("flying")) === "+12");
check("the count is a small pill after the name", await q(`(() => { const c = ${chip("swim")}.querySelector('.chip__count'), n = ${chip("swim")}.querySelector('.chip__name'); return n.textContent === 'Beach / Pool' && c.classList.contains('chip__count') && c.getBoundingClientRect().left > n.getBoundingClientRect().right; })()`));
check(`a chip's label says it: "${await chipLabel("swim")}"`, (await chipLabel("swim")) === "Beach / Pool, adds 7 items" && (await chipLabel("laundry")) === "Laundry, adds 1 item");
await q(`${chip("warm")}.click()`); await sleep(200);
check(`Warm on: Beach / Pool drops Sandals and Sunscreen (already shown), now ${await chipCount("swim")}`, (await chipCount("swim")) === "+5" && (await chipCount("warm")) === "+4" && (await chipCount("hiking")) === "+6" && (await chipCount("snow")) === "+3");
check("an active chip shows what it brings, in the same form", (await chipCount("warm")) === "+4" && (await chipLabel("warm")) === "Warm, brings 4 items");
await q(`${chip("swim")}.click()`); await sleep(200);
check(`both on: Warm ${await chipCount("warm")} (Beach / Pool would still bring Sandals and Sunscreen without it), Beach / Pool ${await chipCount("swim")}, Snow ${await chipCount("snow")}`,
  (await chipCount("warm")) === "+2" && (await chipCount("swim")) === "+5" && (await chipCount("snow")) === "+2");
await q(`${chip("snow")}.click()`); await sleep(200);
check(`Snow on as well, it follows the trip: Beach / Pool ${await chipCount("swim")} (Extra socks is Snow's too), Hiking ${await chipCount("hiking")}`, (await chipCount("swim")) === "+4" && (await chipCount("snow")) === "+2" && (await chipCount("hiking")) === "+4");
await q(`${chip("swim")}.click()`); await sleep(200); await q(`${chip("warm")}.click()`); await sleep(200);
check(`Warm and Beach / Pool off again: Snow ${await chipCount("snow")}, Warm ${await chipCount("warm")}`, (await chipCount("snow")) === "+4" && (await chipCount("warm")) === "+3" && (await chipCount("swim")) === "+5");
await fresh("/packing/?d=3&k=cold");
check(`Cold + Dressy: Overcoat comes with whichever you turn on second (Dressy ${await chipCount("dressy")})`, (await chipCount("dressy")) === "+7" && (await chipCount("cold")) === "+5");
await q(`${chip("dressy")}.click()`); await sleep(200);
check(`...and counts for both once they are on: Cold ${await chipCount("cold")}, Dressy ${await chipCount("dressy")}`, (await chipCount("cold")) === "+6" && (await chipCount("dressy")) === "+7");
check("counts stay put when you change the days", await (async () => { const a = await chipCount("swim"); await q("document.querySelector('[data-pack-days=\"1\"]').click()"); return (await chipCount("swim")) === a; })());
await shot("packing-chips-counts-mobile");

// The toast when a kit is added, and Show.
await fresh("/packing/?d=3&k=warm,flying,cold,dressy,laundry");
await q("scrollTo(0, 0)");
await q(`${chip("swim")}.click()`); await sleep(150);
check(`turning a kit on: toast "${await q(toastText)}", action "${await q(`${toastAction}.textContent`)}"`, (await q(toastText)) === "Added Beach / Pool · 5 items" && (await q(`${toastAction}.textContent`)) === "Show" && !(await q(`${toastAction}.hidden`)) && await q("document.querySelector('[data-pack-toast]').classList.contains('is-shown')"));
check("the toast count is what the chip said, and the kit is on the list", (await pressed()).includes("swim") && (await kitIds()).includes("warm,swim,cold") && (await names("swim")).join() === "Swimsuit,Cover-up,Collapsible tote,Insect repellent,Extra socks");
check("the glow starts at once", (await glowing()) === "swim" && (await q("getComputedStyle(document.querySelector('[data-pack-kit-id=swim]')).animationName")) === "pack-kit-glow");
await shot("packing-added-toast-mobile");
await sleep(1700);
check("and is removed after about a second and a half", (await glowing()) === "");
await q("scrollTo(0, 0)"); await sleep(100);
await q(`${toastAction}.click()`); await sleep(1300);
const swimTop = await q("Math.round(document.querySelector('[data-pack-kit-id=swim]').getBoundingClientRect().top)");
const headerBottom = await q("Math.round(document.querySelector('.site-header').getBoundingClientRect().bottom)");
check(`Show scrolls the kit to the top, under the header (kit at ${swimTop}px, header ends ${headerBottom}px)`, swimTop >= headerBottom && swimTop <= headerBottom + 32 && (await q("scrollY")) > 500);
check("the toast goes away with it, and the glow plays again on arrival", await q("!document.querySelector('[data-pack-toast]').classList.contains('is-shown')") && (await glowing()) === "swim");
await sleep(1700);
check("and is removed again", (await glowing()) === "");
// Turning a kit off keeps its Undo toast; a one-item kit says "1 item".
await q(`${chip("swim")}.click()`); await sleep(150);
check(`off: "${await q(toastText)}" with ${await q(`${toastAction}.textContent`)}, no glow`, (await q(toastText)) === "Beach / Pool is off" && (await q(`${toastAction}.textContent`)) === "Undo" && (await glowing()) === "");
await undo();
check("Undo is Undo again after a Show toast (it turns the kit back on)", (await pressed()).includes("swim"));
await q(`${chip("laundry")}.click()`); await sleep(100); await q(`${chip("laundry")}.click()`); await sleep(150);
check(`"1 item": "${await q(toastText)}"`, (await q(toastText)) === "Added Laundry · 1 item");
await q("scrollTo(0, 0)");
await q(`${chip("car")}.click()`); await sleep(150);
check(`tapping Car shows "${await q(toastText)}" and the glow (${await glowing()})`, (await q(toastText)) === "Added Car · 3 items" && (await q(`${toastAction}.textContent`)) === "Show" && (await glowing()) === "car");
await q(`${toastAction}.click()`); await sleep(1300);
check("and its Show scrolls to it", await q("(() => { const r = document.querySelector('[data-pack-kit-id=car]').getBoundingClientRect(); return r.top >= document.querySelector('.site-header').getBoundingClientRect().bottom && r.top < 200; })()"));
// Reduced motion: no glow, and Show jumps there.
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await fresh("/packing/?d=3&k=warm,flying,cold,dressy,laundry");
await q(`${chip("swim")}.click()`); await sleep(150);
check("reduced motion: the toast is the same, there's no glow", (await q(toastText)) === "Added Beach / Pool · 5 items" && (await glowing()) === "");
await q(`${toastAction}.click()`); await sleep(150);
check("and Show jumps straight to the kit", await q("(() => { const r = document.querySelector('[data-pack-kit-id=swim]').getBoundingClientRect(); return r.top >= document.querySelector('.site-header').getBoundingClientRect().bottom && r.top < 200; })()") && (await glowing()) === "");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

// ---------- Your own items: the Extras kit ----------
await fresh("/packing/?d=2&k=car");
check("Extras is a kit card, last, with the same look as the others", await q("(() => { const k = [...document.querySelectorAll('.pack-kit')]; const e = k.at(-1), o = k[0]; const a = getComputedStyle(e), b = getComputedStyle(o); return e.dataset.packKitId === 'extras' && a.borderRadius === b.borderRadius && a.backgroundColor === b.backgroundColor && a.borderTopColor === b.borderTopColor && e.querySelector('.pack-kit__name').textContent === 'Extras'; })()"));
check("the bottom add form is gone", await q("!document.querySelector('[data-pack-extra-form]') && !document.querySelector('.pack-extra')"));
check(`empty: just the add row, count ${await kitCount("extras")} hidden, open`, (await q("document.querySelectorAll('[data-pack-kit-id=extras] li').length")) === 1 && (await kitCount("extras")) === "hidden" && !(await folded("extras"))
  && await q("document.querySelector('[data-pack-kit-id=extras] li').classList.contains('pack-add')") && !(await q("document.querySelector('[data-pack-kit-id=extras]').classList.contains('is-complete')")));
check(`the row has a hidden label and a "+ Add an item…" input: ${await q("document.querySelector('[data-pack-extra-input]').placeholder")}`,
  await q("(() => { const i = document.querySelector('[data-pack-extra-input]'); const l = document.querySelector('label[for=pack-extra]'); return i.id === 'pack-extra' && l && l.classList.contains('visually-hidden') && l.textContent === 'Add your own item' && i.placeholder === 'Add an item…' && document.querySelector('.pack-add__plus').textContent === '+'; })()"));
check("the row looks like a list row: as tall as one, no box around it", await q("(() => { const a = document.querySelector('.pack-add').getBoundingClientRect().height, r = document.querySelector('.pack-row').getBoundingClientRect().height; const i = getComputedStyle(document.querySelector('[data-pack-extra-input]')); return Math.abs(a - r) < 6 && i.borderTopWidth === '0px' && i.borderBottomWidth === '0px' && i.backgroundColor === 'rgba(0, 0, 0, 0)'; })()"));
await shot("packing-extras-empty-mobile");
await addExtra("Camera"); await addExtra("  Tripod   legs ");
check(`Enter adds, and the field stays ready for the next one: ${await names("extras")}`, (await names("extras")).join() === "Camera,Tripod legs" && await q("document.activeElement === document.querySelector('[data-pack-extra-input]') && document.querySelector('[data-pack-extra-input]').value === ''"));
check(`the add row stays last: ${await q("[...document.querySelectorAll('[data-pack-kit-id=extras] li')].map(li => li.className.split(' ').pop()).join()")}`, await q("document.querySelector('[data-pack-kit-id=extras] li:last-child').classList.contains('pack-add')"));
check(`count shows up: ${await kitCount("extras")}`, (await kitCount("extras")) === "0/2");
check("saved with the trip", (await saved()).extras.map((x) => x.item).join() === "Camera,Tripod legs");
await tick("Camera");
check("extras check off like the rest", (await names("extras")).join() === "Camera,Tripod legs" && (await kitCount("extras")) === "1/2");
await tick("Tripod legs");
check(`a complete Extras doesn't fold: ${await kitCount("extras")}, open ${!(await folded("extras"))}, add row reachable`, (await kitCount("extras")) === "2/2" && !(await folded("extras")) && await q("document.querySelector('[data-pack-kit-id=extras]').classList.contains('is-complete') && document.querySelector('[data-pack-extra-input]').getBoundingClientRect().height > 0"));
await q(`${row("Tripod legs")}.querySelector('.shopping__action').click()`); await sleep(200);
check(`remove: ${await names("extras")}, toast "${await q(toastText)}"`, (await names("extras")).join() === "Camera");
await undo();
check(`Undo puts it back: ${await names("extras")}`, (await names("extras")).join() === "Camera,Tripod legs");
await addExtra("   "); await addExtra("");
check("an empty item does nothing", (await names("extras")).length === 2);
await q("document.querySelector('[data-pack-extra-input]').focus()"); await send("Input.insertText", { text: "Half-typed" });
await tick("Camera");
check("a half-typed item survives the list redrawing", (await q("document.querySelector('[data-pack-extra-input]').value")) === "Half-typed");
await q("document.querySelector('[data-pack-extra-input]').value = ''");
check("the Extras kit fits and stays on screen", await q(fits) && await q("(() => { const r = document.querySelector('[data-pack-kit-id=extras]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()"));
await q("document.querySelector('[data-pack-kit-id=extras]').scrollIntoView({ block: 'center' })"); await sleep(200);
await shot("packing-extras-mobile");

// ---------- Share ----------
await fresh("/packing/?d=5&k=flying,swim");
await tick("Underwear"); await skip("Sunscreen");
await q("Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })"); // copy instead of the share sheet
const menuToggle = "document.querySelector('[data-pack-menu-toggle]')";
const menuList = "document.querySelector('[data-pack-menu]')";
check("Share is the plan page's menu: a button, closed", await q(`${menuToggle}.textContent === 'Share' && ${menuToggle}.classList.contains('toggle') && ${menuToggle}.parentElement.classList.contains('menu') && ${menuList}.classList.contains('menu__list') && ${menuList}.hidden && ${menuToggle}.getAttribute('aria-expanded') === 'false' && ${menuToggle}.getAttribute('aria-haspopup') === 'true'`));
await q(`${menuToggle}.click()`); await sleep(200);
check(`it opens, with two options: ${await q(`[...${menuList}.querySelectorAll('button')].map(b => b.firstChild.textContent + ' / ' + b.querySelector('small').textContent).join(' | ')`)}`,
  !(await q(`${menuList}.hidden`)) && (await q(`${menuToggle}.getAttribute('aria-expanded')`)) === "true"
  && (await q(`[...${menuList}.querySelectorAll('button')].map(b => b.firstChild.textContent + ' / ' + b.querySelector('small').textContent).join(' | ')`)) === "Packing list / The list, with a link to the trip | Just the link / Opens this trip on their phone");
check("the first option has focus, and the menu is on screen", await q(`document.activeElement === ${menuList}.querySelector('button') && (() => { const r = ${menuList}.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`));
await shot("packing-share-menu-mobile");
await key("Escape", "Escape", 27); await sleep(100);
check("Escape closes it, back on Share", await q(`${menuList}.hidden && document.activeElement === ${menuToggle}`));
await q(`${menuToggle}.click()`); await sleep(100);
await q("document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
check("tapping elsewhere closes it", await q(`${menuList}.hidden && ${menuToggle}.getAttribute('aria-expanded') === 'false'`));
await q(`${menuToggle}.click()`); await sleep(100);
await send("Runtime.evaluate", { expression: `${menuList}.querySelector('[data-pack-share=list]').click()`, userGesture: true }); await sleep(400);
check("choosing an option closes the menu", await q(`${menuList}.hidden`));
const text = await q("navigator.clipboard.readText()");
console.log(text);
check(`copy toast: ${await q(toastText)}`, (await q(toastText)) === "Packing list and trip link copied");
check("text: the trip, kits with amounts, unchecked items only, and the link",
  text.startsWith("Packing list: 5 days · Flying · Beach / Pool\n") && /^- Socks ×6$/m.test(text) && !text.includes("Underwear") && /^- T-shirts ×6$/m.test(text) && /^FLYING$/m.test(text) && /^BEACH \/ POOL$/m.test(text)
  && /^- Check in online \(to do\)$/m.test(text) && /^- Swimsuit$/m.test(text) && /^The trip: \S+\/packing\/\?d=5&k=flying,swim$/m.test(text));
check("skipped items are left out of it", !text.includes("Sunscreen") && text.includes("Insect repellent"));
// Just the link.
await q("navigator.clipboard.writeText('nothing yet')");
await q(`${menuToggle}.click()`); await sleep(100);
await send("Runtime.evaluate", { expression: `${menuList}.querySelector('[data-pack-share=link]').click()`, userGesture: true }); await sleep(400);
const linkText = await q("navigator.clipboard.readText()");
check(`just the link: "${linkText}", toast "${await q(toastText)}"`, /^http\S+\/packing\/\?d=5&k=flying,swim$/.test(linkText) && (await q(toastText)) === "Trip link copied");
// On a phone it goes to the share sheet, with only the URL.
await q("window.__shared = null; Object.defineProperty(navigator, 'share', { value: (d) => { window.__shared = d; return Promise.resolve(); }, configurable: true })");
await q("window.matchMedia = (query) => ({ matches: query === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} })");
await q(`${menuToggle}.click()`); await sleep(100);
await q(`${menuList}.querySelector('[data-pack-share=link]').click()`); await sleep(300);
check(`the share sheet gets only the link: ${await q("JSON.stringify(window.__shared)")}`, await q("window.__shared && window.__shared.text === undefined && /\\/packing\\/\\?d=5&k=flying,swim$/.test(window.__shared.url)"));
await q(`${menuToggle}.click()`); await sleep(100);
await q(`${menuList}.querySelector('[data-pack-share=list]').click()`); await sleep(300);
check("and the list option sends the list with it", await q("window.__shared.text.startsWith('Packing list: 5 days') && window.__shared.url.includes('/packing/')"));

// ---------- Shared links ----------
await fresh("/packing/?d=3&k=car");
check("the same trip: no prompt", await q("document.querySelector('[data-pack-shared]').hidden"));
await go("/packing/?d=4&k=rain");
check(`a different trip with nothing checked: just opens it (${await days()}, ${await pressed()})`, await q("document.querySelector('[data-pack-shared]').hidden") && (await days()) === "4 days" && (await pressed()) === "rain");
await tick("Umbrella"); await skip("Rain jacket");
await go("/packing/?d=4&k=rain");
check("the same trip with ticks and skips: no prompt, both kept", await q("document.querySelector('[data-pack-shared]').hidden") && (await saved()).checked.join() === "umbrella" && (await saved()).skipped.join() === "rain-jacket");
await go("/packing/?d=7&k=flying,warm");
check(`a different trip when mine has ticks: asks "${await q("document.querySelector('[data-pack-shared]').textContent.replace(/\\s+/g, ' ').trim()")}"`,
  !(await q("document.querySelector('[data-pack-shared]').hidden")) && (await q("document.querySelector('[data-pack-shared-summary]').textContent")) === "(7 days · Flying · Warm)."
  && (await days()) === "4 days" && (await pressed()) === "rain");
check("and my trip is untouched until I choose", (await saved()).days === 4 && (await saved()).checked.join() === "umbrella");
await shot("packing-shared-mobile");
await q("document.querySelector('[data-pack-shared-keep]').click()"); await sleep(200);
check(`Keep mine: prompt gone, URL ${await q("location.search")}`, await q("document.querySelector('[data-pack-shared]').hidden") && (await q("location.search")) === "?d=4&k=rain" && (await saved()).days === 4);
await go("/packing/?d=7&k=flying,warm");
await q("document.querySelector('[data-pack-shared-use]').click()"); await sleep(200);
check(`Use shared trip: ${await days()}, ${await pressed()}, ticks and skips cleared, URL ${await q("location.search")}, toast "${await q(toastText)}"`,
  (await days()) === "7 days" && (await pressed()) === "flying,warm" && (await saved()).checked.length === 0 && (await saved()).skipped.length === 0 && (await q("location.search")) === "?d=7&k=flying,warm" && await q("document.querySelector('[data-pack-shared]').hidden"));
await undo();
check("Undo brings my trip back", (await days()) === "4 days" && (await pressed()) === "rain" && (await saved()).checked.join() === "umbrella" && (await saved()).skipped.join() === "rain-jacket");

// ---------- Start a new trip clears it ----------
check("Start a new trip is there once there's a trip", await q("!document.querySelector('[data-pack-new]').hidden"));
await q("document.querySelector('[data-pack-new]').click()"); await sleep(200);
check(`cleared: storage ${await q(`localStorage.getItem('${KEY}')`)}, URL "${await q("location.search")}", ${await days()}, toast "${await q(toastText)}"`,
  (await q(`localStorage.getItem('${KEY}')`)) === null && (await q("location.search")) === "" && (await days()) === "3 days" && (await pressed()) === "" && (await q(toastText)) === "Trip cleared");
check("the setup is open with the presets back, and the header badge is gone", await q("!document.querySelector('[data-pack-setup-body]').hidden && !document.querySelector('[data-pack-presets-block]').hidden && document.querySelector('[data-pack-trip-tools]').hidden") && (await q(badge)) === "hidden");
await undo();
check(`Undo brings it back: ${(await saved()).days} days, ${(await saved()).kits}, ${(await saved()).checked}`, (await saved()).days === 4 && (await saved()).kits.join() === "rain" && (await saved()).checked.join() === "umbrella" && (await saved()).skipped.join() === "rain-jacket" && (await q("location.search")) === "?d=4&k=rain");
await go("/packing/");
check("nothing else clears it: still there after a reload", (await saved()).checked.join() === "umbrella");
// Old and odd saved data doesn't break the page.
await q(`localStorage.setItem('${KEY}', JSON.stringify({ days: 'lots', kits: ['rain', 'bogus'], checked: [1, 'umbrella'], skipped: [2, 'umbrella', 'rain-jacket'], setupFolded: 'yes', progress: 'lots', extras: [{ id: 1 }, null, { id: 'x', item: 'Hat pin' }] }))`);
await go("/packing/");
check(`odd saved data: ${await days()}, ${await pressed()}, extras ${await names("extras")}`, (await days()) === "3 days" && (await pressed()) === "rain" && (await names("extras")).join() === "Hat pin");
check(`an item can't be both: packed wins (${(await saved()).checked} / ${(await saved()).skipped}), setup stays open, progress put right`, await q(`${row("Umbrella")}.querySelector('input').checked && ${row("Rain jacket")}.classList.contains('is-skipped') && !${row("Umbrella")}.classList.contains('is-skipped')`)
  && !(await q("document.querySelector('[data-pack-setup-body]').hidden")) && (await saved()).progress.packed === 1 && (await saved()).progress.skipped === 1 && (await saved()).setupFolded === false && (await saved()).skipped.join() === "rain-jacket");

// ---------- The header: nav order, the divider, and the Packing badge ----------
// Recipes · Plan │ Packing, then the cooking pot while there is one.
const navHrefs = "[...document.querySelectorAll('.site-nav > ul > li')].map(li => (li.querySelector('a') || { getAttribute: () => 'cooking' }).getAttribute('href')).join()";
const navCss = readFileSync(new URL("../_data/sections.yml", import.meta.url), "utf8");
check("sections.yml says which section Plan goes with, so the nav is data-driven", /- id: recipes[\s\S]*?group_with_plan: true[\s\S]*?- id: packing/.test(navCss) && (navCss.match(/group_with_plan: true/g) || []).length === 1);
for (const path of ["/", "/recipes/", "/plan/", "/packing/"]) {
  await go(path);
  check(`${path}: nav is Recipes, Plan, Packing, then the pot: ${await q(navHrefs)}`, (await q(navHrefs)) === "/recipes/,/plan/,/packing/,cooking");
}
await go("/packing/");
check("a thin divider starts the Packing group, and only that one", await q(`(() => {
  const li = [...document.querySelectorAll('.site-nav > ul > li')];
  const t = document.createElement('i'); t.style.borderLeft = '1px solid var(--line-strong)'; document.body.append(t);
  const line = getComputedStyle(t).borderLeftColor; t.remove();
  const own = li.map((x) => getComputedStyle(x).borderLeftWidth);
  return own.join() === '0px,0px,1px,0px' && li[2].classList.contains('site-nav__group-start') && getComputedStyle(li[2]).borderLeftColor === line && li[2].getBoundingClientRect().left > li[1].getBoundingClientRect().right;
})()`));
check("the current page is marked: Packing here, Plan on its page", await q("document.querySelector('.site-nav a[href=\"/packing/\"]').getAttribute('aria-current') === 'page' && !document.querySelector('.site-nav a[href=\"/plan/\"]').hasAttribute('aria-current')"));
await go("/plan/");
check("and Recipes isn't marked on /plan/", await q("document.querySelector('.site-nav a[href=\"/plan/\"]').getAttribute('aria-current') === 'page' && !document.querySelector('.site-nav a[href=\"/recipes/\"]').hasAttribute('aria-current')"));

// The badge: the percent decided, from what packing.js saved. Not a trip, nothing to count, or all done: hidden.
await go("/recipes/");
const showBadge = async (progress, extra = {}) => { await seed({ days: 5, kits: ["flying", "swim"], progress, ...extra }); await go("/recipes/"); };
await q("localStorage.clear()"); await go("/recipes/");
check(`no saved trip: badge ${await q(badge)}`, (await q(badge)) === "hidden" && await q("!document.querySelector('.site-nav a[href=\"/packing/\"]').hasAttribute('aria-label')"));
await showBadge({ packed: 30, skipped: 6, total: 50 });
check(`36 of 50 decided: badge ${await q(badge)}`, (await q(badge)) === "72%" && (await q("document.querySelector('.site-nav a[href=\"/packing/\"]').getAttribute('aria-label')")) === "Packing, 72% decided"
  && await q("document.querySelector('[data-packing-count]').classList.contains('plan-link__count')"));
check("Plan's badge is still its own", (await q("document.querySelector('[data-plan-count]').hidden")) && await q("document.querySelector('[data-plan-count]') !== document.querySelector('[data-packing-count]')"));
await shot("packing-badge-recipes-mobile");
await showBadge({ packed: 0, skipped: 0, total: 50 });
check(`nothing decided yet: ${await q(badge)}`, (await q(badge)) === "0%");
await showBadge({ packed: 665, skipped: 0, total: 666 });
check(`665 of 666 never rounds up to 100%: ${await q(badge)}`, (await q(badge)) === "99%");
await showBadge({ packed: 44, skipped: 6, total: 50 });
check(`everything decided (packed + skipped = total): ${await q(badge)}`, (await q(badge)) === "hidden" && await q("!document.querySelector('.site-nav a[href=\"/packing/\"]').hasAttribute('aria-label')"));
await showBadge({ packed: 0, skipped: 0, total: 0 });
check(`total 0: ${await q(badge)}`, (await q(badge)) === "hidden");
for (const bad of [undefined, null, "lots", { packed: "a", skipped: 0, total: 5 }, { packed: -1, skipped: 0, total: 5 }, { packed: 1, skipped: 0 }]) {
  await showBadge(bad);
  check(`a trip with no usable progress (${JSON.stringify(bad)}): ${await q(badge)}`, (await q(badge)) === "hidden");
}
await q("localStorage.setItem('hawkins:packing', 'not json')"); await go("/recipes/");
check(`corrupt storage: ${await q(badge)}`, (await q(badge)) === "hidden");
// packing.js is what writes it: it follows the list, and it's there for the other pages.
await fresh("/packing/?d=3&k=rain");
const rows0 = await rowCount();
check(`packing.js saves progress with the trip: ${JSON.stringify((await saved()).progress)}`, JSON.stringify((await saved()).progress) === JSON.stringify({ packed: 0, skipped: 0, total: rows0 }) && (await q(badge)) === "0%");
await tick("Umbrella"); await skip("Rain jacket");
check(`ticks and skips move the saved progress and the header's badge at once: ${JSON.stringify((await saved()).progress)}, ${await q(badge)}`,
  JSON.stringify((await saved()).progress) === JSON.stringify({ packed: 1, skipped: 1, total: rows0 }) && (await q(badge)) === `${Math.round((2 / rows0) * 100)}%`);
await tick("Umbrella"); await q(`${row("Rain jacket")}.querySelector('.pack-row__skip').click()`); await sleep(200);
check(`unticked and brought back: ${await q(badge)}`, (await q(badge)) === "0%");
await q("[...document.querySelectorAll('.site-nav a')].find(a => a.textContent.includes('Recipes')).click()"); await sleep(800);
check(`it follows you to the next page in place: ${await q("location.pathname")}, ${await q(badge)}`, (await q("location.pathname")) === "/recipes/" && (await q(badge)) === "0%" && (await q("document.querySelectorAll('[data-packing-count]').length")) === 1);
// Another tab changes the trip while this page is open.
await q(`localStorage.setItem('${KEY}', JSON.stringify({ ...JSON.parse(localStorage.getItem('${KEY}')), progress: { packed: 1, skipped: 0, total: 4 } })); dispatchEvent(new StorageEvent('storage', { key: '${KEY}' }))`);
check(`another tab's change shows too: ${await q(badge)}`, (await q(badge)) === "25%");
await q("history.back()"); await sleep(800);
await q("document.querySelector('[data-pack-new]').click()"); await sleep(200);
check(`Start a new trip: ${await q(badge)}`, (await q(badge)) === "hidden");
await undo();
check(`Undo: ${await q(badge)}`, (await q(badge)) === "0%");

// A trip with only skips counts as started: a different link asks first.
await fresh("/packing/?d=3&k=rain");
await skip("Rain jacket");
await go("/packing/?d=4&k=car");
check("skips alone count: a different trip asks first", !(await q("document.querySelector('[data-pack-shared]').hidden")) && (await days()) === "3 days");

// ---------- Moving around the site (Turbo swaps pages in place) ----------
await fresh("/packing/?d=3&k=car");
await q("[...document.querySelectorAll('.site-nav a')].find(a => a.textContent.trim() === 'Recipes').click()"); await sleep(800);
await q("document.querySelector('.site-nav a[href=\"/packing/\"]').click()"); await sleep(800);
check(`in-place visit back: list is live (${await progress()}), ${await q("location.search")}`,
  (await q("location.pathname")) === "/packing/" && (await progress()).startsWith("0 packed") && (await q("document.querySelectorAll('.pack-kit').length")) > 0 && (await q("location.search")) === "?d=3&k=car");
await tick("Phone"); 
check("checking works after an in-place visit", (await saved()).checked.includes("phone"));
await tick("Phone");
await skip("Phone charger");
await q("document.querySelector('.site-nav a[href=\"/recipes/\"]').click()"); await sleep(800);
await q("document.querySelector('.site-nav a[href=\"/packing/\"]').click()"); await sleep(800);
check("skips are the same after an in-place visit, and nothing doubles up", (await saved()).skipped.join() === "phone-charger" && (await q("document.querySelectorAll('.pack-row.is-skipped').length")) === 1 && (await q("document.querySelectorAll('[data-pack-extra-input]').length")) === 1 && (await q("document.querySelectorAll('[data-pack-menu-toggle]').length")) === 1);

// ---------- The kit chips wrap: every kit in view, on a phone too ----------
await fresh("/packing/?d=3&k=flying");
const chipRow = "document.querySelector('[data-pack-kit-chips]')";
const chipsWrap = `[...document.querySelectorAll('.pack-chips')].every(e => { const c = getComputedStyle(e), b = e.getBoundingClientRect(); return c.flexWrap === 'wrap' && c.overflowX === 'visible' && e.scrollWidth <= e.clientWidth && [...e.children].every(x => { const r = x.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1; }); })`;
check("phone: the chips wrap, every one whole, nothing to swipe", await q(chipsWrap));
check("Share sits on the Checklist heading's line", await q(`(() => { const h = document.querySelector('#pack-list-title').getBoundingClientRect(), b = document.querySelector('[data-pack-menu-toggle]').getBoundingClientRect(); return b.top < h.bottom && b.bottom > h.top && b.right <= innerWidth; })()`));
check("the page itself doesn't scroll sideways", await q(fits));
await q(`${chipRow}.scrollIntoView({ block: 'center' })`); await sleep(200);
await shot("packing-chips-wrapped-mobile");
await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await go("/packing/");
check("360px: they still wrap and fit", await q(chipsWrap) && await q(fits));
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/packing/");
check("wide screen: the chips wrap, no scrolling", await q(chipsWrap));
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// ---------- Layout: one column of kits, and a setup that stays in view ----------
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await fresh("/packing/?d=7&k=flying,warm,swim,rain");
const lefts = () => q("[...document.querySelectorAll('.pack-kit')].map(k => Math.round(k.getBoundingClientRect().left))");
const setupBox = () => q("(() => { const r = document.querySelector('.pack-setup').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; })()");
check(`1280: kits are one column, every left edge the same (${(await lefts())[0]}px, ${(await lefts()).length} kits)`, new Set(await lefts()).size === 1 && (await q("getComputedStyle(document.querySelector('[data-pack-kits]')).gridTemplateColumns.split(' ').length")) === 1);
check("1280: kits stack, none beside another", await q("(() => { const t = [...document.querySelectorAll('.pack-kit')].map(k => k.getBoundingClientRect()); return t.every((r, i) => i === 0 || r.top >= t[i - 1].bottom); })()"));
const listBox = await q("(() => { const r = document.querySelector('.pack-list').getBoundingClientRect(), c = document.querySelector('.pack-page').getBoundingClientRect(); return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), gap: Math.round(c.right - r.right) }; })()");
check(`1280: setup left, checklist right (setup ${(await setupBox()).left}-${(await setupBox()).right}px, checklist ${listBox.left}-${listBox.right}px)`, (await setupBox()).right < listBox.left);
check(`1280: the checklist isn't too wide (${listBox.width}px, at most 44rem = 704px), and no big gap to its right (${listBox.gap}px)`, listBox.width <= 704 && listBox.width >= 560 && listBox.gap < 64);
check("1280: the setup is sticky", (await q("getComputedStyle(document.querySelector('.pack-setup')).position")) === "sticky");
await q("scrollTo(0, 600)"); await sleep(250);
const stuck = await setupBox();
const headerEnd = await q("Math.round(document.querySelector('.site-header').getBoundingClientRect().bottom)");
check(`1280: scrolled down 600px it stays under the header (top ${stuck.top}px, header ends ${headerEnd}px)`, (await q("scrollY")) > 500 && stuck.top >= headerEnd && stuck.top <= headerEnd + 32 && stuck.bottom <= 900);
// Taller than the window: it scrolls inside itself rather than being cut off.
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 520, deviceScaleFactor: 1, mobile: false });
await q("document.querySelector('[data-pack-new]').click()"); await sleep(200);
await q("scrollTo(0, 400)"); await sleep(250);
check("1280 x 520: the setup scrolls inside itself, and its bottom is on screen", await q("(() => { const e = document.querySelector('.pack-setup'), c = getComputedStyle(e); return e.scrollHeight > e.clientHeight && (c.overflowY === 'auto' || c.overflowY === 'scroll') && e.getBoundingClientRect().bottom <= innerHeight; })()"));
await q("document.querySelector('.pack-setup').scrollTop = 9999"); await sleep(100);
check("and its last line can be reached", await q("(() => { const e = document.querySelector('.pack-setup'); return e.scrollTop + e.clientHeight >= e.scrollHeight - 1; })()"));
await undo(); // Start a new trip cleared it
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await fresh("/packing/?d=7&k=flying,warm,swim,rain");
const wide = await q("(() => { const r = document.querySelector('.pack-list').getBoundingClientRect(); return Math.round(r.width); })()");
check(`1440: still one column (${(await lefts())[0]}px), checklist ${wide}px wide`, new Set(await lefts()).size === 1 && wide <= 704 && (await q(fits)));
await shot("packing-desktop-1440");
await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });
await go("/packing/");
check("1000: two columns, one column of kits", new Set(await lefts()).size === 1 && (await q("getComputedStyle(document.querySelector('.pack-setup')).position")) === "sticky" && await q(fits));
await send("Emulation.setDeviceMetricsOverride", { width: 800, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/packing/");
check("800: one column page, one column of kits, setup not sticky", new Set(await lefts()).size === 1 && (await q("getComputedStyle(document.querySelector('.pack-setup')).position")) === "static" && await q(fits));
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go("/packing/");
check("phone: the setup is not sticky, and kits are one column", (await q("getComputedStyle(document.querySelector('.pack-setup')).position")) === "static" && new Set(await lefts()).size === 1);
await q("scrollTo(0, 1400)"); await sleep(200);
check("phone: scrolling the page takes the setup with it", (await setupBox()).bottom < 0);
await q("scrollTo(0, 0)");

// ---------- Both themes, and a wide screen ----------
// A trip well along: some packed, some skipped, one kit all decided, a few of your own things.
const along = async () => {
  await fresh("/packing/?d=7&k=flying,warm,swim,rain");
  await tick("Swimsuit"); await tick("Sunscreen"); await tick("Hat");
  await skip("Sandals"); await skip("Cover-up"); await skip("Insect repellent");
  await tick("Umbrella"); await skip("Rain jacket");
  await addExtra("Camera"); await addExtra("Tripod");
  await tick("Camera");
};
await along();
for (const t of ["dark", "light"]) {
  await q(`localStorage.setItem('hawkins:theme', '${t}')`);
  await go("/packing/");
  check(`${t}: fits at 390px`, await q(fits));
  check(`${t}: kit cards stay inside the screen`, await q("[...document.querySelectorAll('.pack-kit')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })"));
  await q("scrollTo(0, 0)"); await sleep(200);
  await shot(`packing-setup-open-${t}-mobile`);
  await q("document.querySelector('[data-pack-kit-id=swim]').scrollIntoView()"); await sleep(200);
  await shot(`packing-skipped-${t}-mobile`);
  // The states are clearly different from each other in this theme, and from a plain row.
  const look = (name) => q(`(() => { const li = ${row(name)}, b = getComputedStyle(li.querySelector('.check__box')), x = getComputedStyle(li.querySelector('.check__text')), n = getComputedStyle(li.querySelector('.pack-row__name')); return { line: x.textDecorationLine, color: n.color, box: b.backgroundColor + '|' + b.borderTopColor + '|' + b.borderTopLeftRadius + '|' + b.borderTopStyle }; })()`);
  const faint = await q("(() => { const e = document.createElement('i'); e.style.color = 'var(--text-faint)'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; })()");
  const [plain, skippedLook, packedLook] = [await look("Collapsible tote"), await look("Sandals"), await look("Sunscreen")];
  check(`${t}: skipped is faded (--text-faint) with no line; packed is struck through; the two boxes differ from each other and from a plain row`,
    skippedLook.color === faint && skippedLook.line === "none" && packedLook.line === "line-through" && plain.line === "none" && plain.color !== faint
    && new Set([plain.box, skippedLook.box, packedLook.box]).size === 3);
  check(`${t}: a skipped box is outlined in --text-faint, not red-filled`, skippedLook.box.startsWith("rgba(0, 0, 0, 0)|" + faint));
  await q("document.querySelector('[data-pack-kit-id=flying]').scrollIntoView()"); await sleep(200);
  await shot(`packing-row-states-${t}-mobile`);
  await q("document.querySelector('[data-pack-kit-id=rain]').scrollIntoView({ block: 'center' })"); await sleep(200);
  await shot(`packing-kit-folded-${t}-mobile`);
  await q("document.querySelector('[data-pack-kit-id=extras]').scrollIntoView({ block: 'center' })"); await sleep(200);
  await shot(`packing-extras-${t}-mobile`);
  await q("document.querySelector('.pack-credit').scrollIntoView({ block: 'center' })"); await sleep(200);
  await shot(`packing-footer-${t}-mobile`);
  await q("scrollTo(0, 0)");
  await q("document.querySelector('[data-pack-menu-toggle]').scrollIntoView({ block: 'center' })");
  await q("document.querySelector('[data-pack-menu-toggle]').click()"); await sleep(200);
  await shot(`packing-share-menu-${t}-mobile`);
  await q("document.querySelector('[data-pack-menu-toggle]').click()");
  await q("scrollTo(0, 0)");
  await q("document.querySelector('[data-pack-summary-done]').click()"); await sleep(200);
  await shot(`packing-setup-folded-${t}-mobile`);
  await q("document.querySelector('[data-pack-summary]').click()"); await sleep(100);
  await q("document.querySelector('[data-pack-new]').click()"); await sleep(200);
  await q("document.querySelector('[data-pack-presets-block]').scrollIntoView({ block: 'center' })"); await sleep(200);
  await shot(`packing-presets-${t}-mobile`);
  await undo(); // Start a new trip cleared it
  await q("scrollTo(0, 0)");
}
await q("localStorage.removeItem('hawkins:theme')");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/packing/");
check("desktop fits", await q(fits));
check("desktop: the Share menu sits inside the window", await q("(() => { document.querySelector('[data-pack-menu-toggle]').click(); const r = document.querySelector('[data-pack-menu]').getBoundingClientRect(); document.querySelector('[data-pack-menu-toggle]').click(); return r.left >= 0 && r.right <= innerWidth; })()"));
for (const t of ["dark", "light"]) {
  await q(`localStorage.setItem('hawkins:theme', '${t}')`);
  for (const width of [1280, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await go("/packing/");
    await q("scrollTo(0, 0)"); await sleep(200);
    await shot(`packing-desktop-${t}${width === 1280 ? "" : "-1440"}`);
  }
  // Scrolled down, with a kit just added: the setup stays beside it.
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await go("/packing/");
  await q("document.querySelector('[data-pack-kit=cold]').click()"); await sleep(200);
  await q("scrollTo(0, 500)"); await sleep(250);
  await shot(`packing-desktop-added-${t}`);
}
await q("localStorage.removeItem('hawkins:theme')");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/packing/");

// ---------- Small phones ----------
await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await fresh("/packing/?d=30&k=flying,car,international,warm,swim,cold,snow,hiking,dressy,rain");
check("a small phone with every kit on fits", await q(fits));
check("the Share menu fits there too", await q("(() => { document.querySelector('[data-pack-menu-toggle]').click(); const r = document.querySelector('[data-pack-menu]').getBoundingClientRect(); document.querySelector('[data-pack-menu-toggle]').click(); return r.left >= 0 && r.right <= innerWidth; })()"));
// Plan's count and Packing's percent both show; the header stays on one line, Packing whole.
const crowd = "document.querySelector('[data-plan-count]').textContent = '12'; document.querySelector('[data-plan-count]').hidden = false; document.querySelector('[data-packing-count]').textContent = '99%'; document.querySelector('[data-packing-count]').hidden = false";
await q(crowd);
check(`header at 360px with both badges: one line (${await q("Math.round(document.querySelector('.site-header').getBoundingClientRect().height)")}px), fits`, await q("document.querySelector('.site-header').getBoundingClientRect().height < 70 && document.querySelector('.site-nav a[href=\"/packing/\"]').getBoundingClientRect().height < 40") && await q(fits));
check("nothing in the nav is squeezed onto a second line", await q("[...document.querySelectorAll('.site-nav > ul > li')].filter(li => !li.hidden).every(li => li.getBoundingClientRect().height < 46)") && await q("(() => { const p = document.querySelector('.site-nav a[href=\"/packing/\"]').getBoundingClientRect(); return p.right <= innerWidth; })()"));
await shot("packing-small-phone");
await q("document.querySelector('[data-cooking]').hidden = false");
check("header at 360px with the pot as well: fits", await q(fits) && await q("document.querySelector('.site-header').getBoundingClientRect().height < 70"));
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 740, deviceScaleFactor: 2, mobile: true });
await go("/packing/");
await q(crowd + "; document.querySelector('[data-cooking]').hidden = false");
check(`header at 375px with Plan's count, Packing's badge and the Cooking pot: fits (${await q("Math.round(document.querySelector('.site-nav').getBoundingClientRect().right)")}px of 375)`, await q(fits) && await q("document.querySelector('.site-header').getBoundingClientRect().height < 70")
  && await q("document.querySelector('.site-nav').getBoundingClientRect().right <= innerWidth - 8 && [...document.querySelectorAll('.site-nav > ul > li')].every(li => li.getBoundingClientRect().height < 46)"));
await shot("packing-header-375");
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
