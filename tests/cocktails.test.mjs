// Cocktails: the _cocktails/ files, the list on /cocktails/ (the Upside Bar banner and recipe-style
// cards), each cocktail's page (hero, ingredients, steps, where we had it; 4:5 photo or the placeholder,
// a short strip on phones), planning drinks (+ Plan, the plan's Drinks heading, the shopping list), Esc
// back to the list (recipes too), the layout at phone and desktop widths, and its file card on the home page.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "./lib.mjs";

const { send, ev, go, until, sleep, check, shot, errors, finish } = await open();
const q = ev;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const size = (width, height = 900, mobile = width < 700) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
const fits = "document.documentElement.scrollWidth <= document.documentElement.clientWidth";
const ruby = (script, ...args) => JSON.parse(execFileSync("ruby", ["-ryaml", "-rjson", "-e", script, ...args], { encoding: "utf8" }));

// ---------- The data ----------
const dir = join(ROOT, "_cocktails");
const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
const cocktails = files.map((f) => ({ slug: f.replace(/\.md$/, ""), ...ruby("puts JSON.generate(YAML.safe_load(File.read(ARGV[0]).split(/^---\\s*$/)[1]))", join(dir, f)) }));
check(`${cocktails.length} cocktails, titles unique`, cocktails.length === 3 && new Set(cocktails.map((c) => c.title.toLowerCase())).size === cocktails.length);
const recipeSlugs = readdirSync(join(ROOT, "_recipes")).map((f) => f.replace(/\.md$/, ""));
check("no cocktail's file name matches a recipe's (the meal plan knows both by name)", cocktails.every((c) => !recipeSlugs.includes(c.slug)));
check("every cocktail has a title, spirit, summary, glass, ingredients with qty and item, and steps", cocktails.every((c) => c.title && c.spirit && c.summary && c.glass && c.ingredients.length > 0 && c.ingredients.every((i) => typeof i.qty === "string" && i.item) && c.steps.length > 0 && c.steps.every((s) => typeof s === "string")));
check("every photo is in assets/images/cocktails/, with its JPG, WebP, and alt text", cocktails.filter((c) => c.image).every((c) => c.image.startsWith("/assets/images/cocktails/") && c.image.endsWith(".jpg") && c.image_alt && [c.image, c.image.replace(/\.jpg$/, ".webp")].every((f) => existsSync(join(ROOT, f)))));

// ---------- The list ----------
await size(390, 844);
await go("/cocktails/");
check(`title: ${await q("document.title")}`, (await q("document.title")) === "Cocktails · Hawkins");
check("eyebrow and title, and no lede", (await q("document.querySelector('.eyebrow').textContent")) === "File 003 · Bar" && (await q("document.querySelector('.page-title').textContent")) === "Cocktails" && !(await q("!!document.querySelector('.page-head__lede')")));
const banner = () => q("(() => { const f = document.querySelector('.cocktail-banner'); const i = f.querySelector('img'); const r = f.getBoundingClientRect(); return { ratio: Math.round(r.width / r.height * 100) / 100, loaded: i.complete && i.naturalWidth > 0, webp: /\\.webp$/.test(i.currentSrc), alt: i.alt, graded: f.classList.contains('is-photo'), between: f.previousElementSibling.classList.contains('page-head') && f.nextElementSibling.classList.contains('card-grid') }; })()");
let b = await banner();
check(`phone banner, right under the title: ${JSON.stringify(b)}`, b.ratio === 2.5 && b.loaded && b.webp && b.alt.includes("The Upside") && b.graded && b.between);
const cards = "[...document.querySelectorAll('.card--cocktail')]";
check("3 recipe-style cards, A–Z, linking to each page", (await q(`${cards}.map(c => c.querySelector('.card__link').textContent + ' ' + c.querySelector('.card__link').getAttribute('href')).join(' | ')`)) === "Black Cherry Mule /cocktails/black-cherry-mule/ | Demogorgon /cocktails/demogorgon/ | Friends Don't Lie /cocktails/friends-dont-lie/");
await until(`${cards}.every(c => c.querySelector('.card__plan')?.textContent === '+ Plan')`, 5000); // plan.js shows and labels them
check("cards show the spirit and ingredient count, and + Plan", (await q(`${cards}.map(c => c.querySelector('.eyebrow').textContent + ', ' + c.querySelector('.card__meta').textContent.trim()).join(' | ')`)) === "Bourbon, 4 ingredients | Bourbon, 6 ingredients | Tequila, 6 ingredients"
  && await q(`${cards}.every(c => { const b = c.querySelector('.card__plan'); return b && !b.hidden && b.textContent === '+ Plan'; })`));
check("phone: cards are a list, thumbnail on the left", await q(`${cards}.every(c => getComputedStyle(c).flexDirection === 'row')`));
check("no photo yet: the quiet glass tile; Friends Don't Lie: its photo, graded", await q("(() => { const [mule, demo, fdl] = [...document.querySelectorAll('.card--cocktail .card__media')]; return !!mule.querySelector('.card__placeholder svg') && !!demo.querySelector('.card__placeholder') && fdl.classList.contains('is-photo') && !!fdl.querySelector('picture source[type=\"image/webp\"]'); })()"));
await q("document.querySelector('.card--cocktail:last-child').scrollIntoView()"); await sleep(400);
check("the photo loads, as a WebP", await q("(() => { const i = document.querySelector('.card--cocktail .is-photo img'); return i.complete && i.naturalWidth > 0 && /\\.webp$/.test(i.currentSrc); })()"));
await size(1280, 900); await go("/cocktails/");
b = await banner();
check(`desktop banner shows the whole sign: ${b.ratio}`, Math.abs(b.ratio - 1600 / 350) < 0.05 && b.loaded && (await q("getComputedStyle(document.querySelector('.cocktail-banner img')).objectPosition")) === "50% 50%");
check("desktop: cards are columns", await q(`${cards}.every(c => getComputedStyle(c).flexDirection === 'column') && new Set(${cards}.map(c => c.getBoundingClientRect().top)).size === 1`));
// A photo and a "no photo" tile take exactly the same space, like on the recipe cards.
const frames = `${cards}.map(c => { const r = c.querySelector('.card__media').getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })`;
const sameFrames = async () => { const f = await q(frames); return new Set(f).size === 1 && f; };
check(`desktop: photo and placeholder frames match, 3:2 (${await q(frames)})`, !!(await sameFrames()) && await q("(() => { const r = document.querySelector('.card--cocktail .card__media').getBoundingClientRect(); return Math.abs(r.width / r.height - 1.5) < 0.02; })()"));
await size(390, 844); await go("/cocktails/");
check(`phone: photo and placeholder frames match (${await q(frames)})`, !!(await sameFrames()));
check("phone banner: centered on the sign", (await q("getComputedStyle(document.querySelector('.cocktail-banner img')).objectPosition")) === "55% 50%");

// ---------- A cocktail's page ----------
await size(390, 844);
await go("/cocktails/");
await q("document.querySelector('.card--cocktail a[href=\"/cocktails/demogorgon/\"]').click()");
await sleep(900);
check(`tapping a card opens its page: ${await q("location.pathname")}`, (await q("location.pathname")) === "/cocktails/demogorgon/" && (await q("document.title")) === "Demogorgon · Hawkins");
check("breadcrumb back to Cocktails", (await q("document.querySelector('.breadcrumb a').getAttribute('href')")) === "/cocktails/" && (await q("document.querySelector('.breadcrumb [aria-current=page]').textContent")) === "Demogorgon");
check("hero: Cocktail, title, summary", (await q("document.querySelector('.recipe-hero .eyebrow').textContent")) === "Cocktail" && (await q("document.querySelector('.recipe-hero__title').textContent")) === "Demogorgon"
  && (await q("document.querySelector('.recipe-hero__summary').textContent")).startsWith("A maple old fashioned"));
const stats = "[...document.querySelectorAll('.stat')].map(s => s.querySelector('dt').textContent + ': ' + s.querySelector('dd').textContent).join(' | ')";
check(`three stat boxes, like a recipe's: ${await q(stats)}`, (await q(stats)) === "Spirit: Bourbon | Glass: Rocks glass | Makes: 1 drink"
  && await q("(() => { const s = [...document.querySelectorAll('.stat')].map(e => e.getBoundingClientRect()); return new Set(s.map(r => Math.round(r.top))).size === 1 && new Set(s.map(r => Math.round(r.width))).size === 1; })()"));
const ingredients = "[...document.querySelectorAll('.cocktail-ingredients li')].map(li => li.textContent.replace(/\\s+/g, ' ').trim()).join(' | ')";
check(`ingredients: ${await q(ingredients)}`, (await q(ingredients)) === "2 oz bourbon, such as WhistlePig | ¼ oz pure maple syrup | 2 dashes Angostura bitters | 1 strip of orange peel, for the twist | 1 Luxardo maraschino cherry | 1 mini stroopwafel"
  && (await q("document.querySelector('#ingredients-title').nextElementSibling.textContent")) === "6 items");
check("amounts are amber, like a recipe's", await q("(() => { const a = getComputedStyle(document.querySelector('.cocktail-ingredients .qty')), r = getComputedStyle(document.querySelector('.cocktail-ingredients li')); return a.color !== r.color && Number(a.fontWeight) >= 600; })()"));
check("5 numbered steps, shaken, with a bold time", (await q("[...document.querySelectorAll('.step__num')].map(n => n.textContent).join()")) === "1,2,3,4,5" && (await q("document.querySelector('.step__text strong').textContent")) === "15 seconds" && (await q("document.querySelector('.steps').textContent")).includes("cocktail shaker"));
check("no cook mode: no Start cooking, servings, or Favorite, and the step numbers aren't buttons", await q("!document.querySelector('[data-cook], [data-servings], [data-fave], button.step__num')"));
check("+ Add to plan, like a recipe's", await q("(() => { const b = document.querySelector('.recipe-hero__actions [data-plan-add]'); return b && !b.hidden && b.textContent === '+ Add to plan' && b.dataset.planAdd === 'demogorgon'; })()"));
check("credit line", (await q("document.querySelector('.source').textContent.trim()")) === "From The Upside Bar at Stranger Things: The Experience.");
const media = () => q("(() => { const m = document.querySelector('.recipe-hero__media'); const i = m.querySelector('img'); const r = m.getBoundingClientRect(); return { ratio: Math.round(r.width / r.height * 100) / 100, w: Math.round(r.width), photo: m.classList.contains('is-photo'), src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 }; })()");
let m = await media();
check(`phone, no photo: the short "Missing" strip, full width: ${JSON.stringify(m)}`, m.ratio === 4 && !m.photo && m.src === "/assets/images/placeholder-cocktail.svg" && m.loaded && m.w > 340);
await size(1280, 900); await go("/cocktails/demogorgon/");
m = await media();
check(`desktop, no photo: the 3:2 placeholder, like a recipe's: ${JSON.stringify(m)}`, m.ratio === 1.5 && m.loaded);
await go("/cocktails/friends-dont-lie/");
m = await media();
check(`desktop photo: 3:2: ${JSON.stringify(m)}`, m.ratio === 1.5 && m.photo && m.loaded);
await size(390, 844); await go("/cocktails/friends-dont-lie/");
m = await media();
check(`phone photo: 3:2, full width, not a strip: ${JSON.stringify(m)}`, m.ratio === 1.5 && m.photo && m.w > 340 && m.loaded);
check("the photo sits at the left edge, lined up with the text", await q("Math.round(document.querySelector('.recipe-hero__media').getBoundingClientRect().left) === Math.round(document.querySelector('.recipe-hero__title').getBoundingClientRect().left)"));
await go("/cocktails/black-cherry-mule/");
check("no from: no credit line", !(await q("!!document.querySelector('.source')")));

// ---------- Planning drinks ----------
await size(390, 844);
await go("/cocktails/"); await q("localStorage.clear()"); await go("/cocktails/");
await q("document.querySelector('.card--cocktail [data-plan-add=\"demogorgon\"]').click()"); await sleep(200);
check("+ Plan on a card adds the drink: the header counts it, the button says Planned", (await q("document.querySelector('[data-plan-count]').textContent")) === "1" && (await q("document.querySelector('[data-plan-add=\"demogorgon\"]').textContent")) === "✓ Planned");
await go("/cocktails/friends-dont-lie/");
await q("document.querySelector('.recipe-hero__actions [data-plan-add]').click()"); await sleep(200);
check("and on its page", (await q("document.querySelector('.recipe-hero__actions [data-plan-add]').textContent")) === "✓ In plan" && (await q("document.querySelector('[data-plan-count]').textContent")) === "2");
await go("/recipes/chicken-marsala/");
await q("document.querySelector('.recipe-hero__actions [data-plan-add]').click()"); await sleep(200);
await go("/plan/"); await sleep(400);
const planItems = (sel) => q(`[...document.querySelectorAll('${sel} .plan-item')].map(li => li.querySelector('.plan-item__title').textContent + ': ' + li.querySelector('.plan-item__serves').textContent + ' ' + li.querySelector('.stepper__value').textContent + ', ' + li.querySelector('.plan-item__cook').textContent).join(' | ')`);
check(`recipes first: ${await planItems("[data-plan-list]")}`, (await planItems("[data-plan-list]")) === "Chicken Marsala: Serves 4, Cook");
check(`then drinks under their own heading: ${await planItems("[data-plan-drinks]")}`, (await planItems("[data-plan-drinks]")) === "Demogorgon: Makes 1, Make | Friends Don't Lie: Makes 1, Make"
  && !(await q("document.querySelector('[data-plan-drinks-title]').hidden")) && (await q("document.querySelector('[data-plan-drinks-title]').textContent")) === "Drinks"
  && (await q("document.querySelector('[data-plan-drinks-title]').previousElementSibling.matches('[data-plan-list]')")));
check(`the count says both: ${await q("document.querySelector('[data-plan-recipe-count]').textContent")}`, (await q("document.querySelector('[data-plan-recipe-count]').textContent")) === "1 recipe, 2 drinks");
check("a drink's link opens it, not cook mode", (await q("document.querySelector('[data-plan-drinks] .plan-item__cook').getAttribute('href')")) === "/cocktails/demogorgon/");
const demoRow = "[...document.querySelectorAll('[data-plan-drinks] .plan-item')].find(li => li.textContent.includes('Demogorgon'))";
check("a drink starts at 1, with no half a drink", await q(`${demoRow}.querySelector('[data-step="-1"]').disabled`));
for (let i = 0; i < 5; i++) { await q(`${demoRow}.querySelector('[data-step="1"]').click()`); await sleep(80); }
check(`up to 4 drinks: ${await q(`${demoRow}.querySelector('.stepper__value').textContent`)}`, (await q(`${demoRow}.querySelector('.stepper__value').textContent`)) === "4" && await q(`${demoRow}.querySelector('[data-step="1"]').disabled`));
await q(`${demoRow}.querySelector('[data-step="-1"]').click()`); await q(`${demoRow}.querySelector('[data-step="-1"]').click()`); await sleep(200);
const row = (name) => q(`(() => { const li = [...document.querySelectorAll('.aisle li')].find(li => li.querySelector('.shopping__name').textContent === ${JSON.stringify(name)}); return li ? li.closest('.aisle').querySelector('h3').textContent + ': ' + li.querySelector('.qty').textContent : null; })()`);
check(`2 Demogorgons: bourbon in ounces, not pounds (${await row("bourbon")})`, (await row("bourbon")) === "Drinks & Alcohol: 4 oz");
check(`bitters (${await row("Angostura bitters")}), tequila (${await row("blanco tequila")}), soda (${await row("lemon-lime soda")}) with the liquor`, (await row("Angostura bitters")) === "Drinks & Alcohol: 4 dashes" && (await row("blanco tequila")) === "Drinks & Alcohol: 1½ oz" && (await row("lemon-lime soda")) === "Drinks & Alcohol: 2 oz");
check(`the twist and the slice are oranges, from Produce (${await row("oranges")})`, (await row("oranges")) === "Produce: 3");
check(`cherries, plural (${await row("Luxardo maraschino cherries")}); stroopwafels (${await row("mini stroopwafels")})`, (await row("Luxardo maraschino cherries")) === "Drinks & Alcohol: 2" && (await row("mini stroopwafels")) === "Snacks: 2");
check("each line links back to the drink", await q("[...document.querySelectorAll('.aisle li')].find(li => li.querySelector('.shopping__name').textContent === 'bourbon').querySelector('.shopping__from a').getAttribute('href') === '/cocktails/demogorgon/#ingredients-title'"));
await go("/"); await q("localStorage.clear()");
await go("/plan/?r=demogorgon:0.5,black-cherry-mule:2"); await sleep(400);
check(`a shared link can't plan half a drink: ${await q("localStorage.getItem('hawkins:plan')")}`, await q("(() => { const p = JSON.parse(localStorage.getItem('hawkins:plan')); return p.recipes.map(r => r.slug + ':' + r.scale).join() === 'demogorgon:1,black-cherry-mule:2'; })()"));
check(`Red Stag shops by its name (${await row("Jim Beam Red Stag")}), lime juice by the ounce (${await row("fresh lime juice")})`, (await row("Jim Beam Red Stag")) === "Drinks & Alcohol: 4 oz" && (await row("fresh lime juice")) === "Produce: 1 oz");
await q("localStorage.clear()");

// ---------- Esc goes back to the list ----------
const esc = async () => {
  for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(900);
};
const where = () => q("location.pathname + location.search + location.hash");
await size(1280, 900);
await go("/recipes/?category=dinner"); await sleep(300);
await q("document.querySelector('.card:not([hidden]) .card__link[href=\"/recipes/chicken-marsala/\"]').click()"); await sleep(900);
check(`recipe page opened from a filtered list: ${await where()}`, (await where()) === "/recipes/chicken-marsala/" && (await q("document.querySelector('.breadcrumb a').getAttribute('aria-keyshortcuts')")) === "Escape");
await esc();
check(`Esc goes back to it, filter and all: ${await where()}`, (await where()) === "/recipes/?category=dinner");
await go("/cocktails/demogorgon/");
await esc();
check(`opened directly, Esc opens the list: ${await where()}`, (await where()) === "/cocktails/");
await go("/recipes/chicken-marsala/"); await sleep(300);
await q("document.querySelector('[data-cook]').click()"); await sleep(400);
check("cook mode is open", await q("!!document.querySelector('dialog[open]')"));
await esc();
check(`Esc in cook mode closes it and stays on the recipe: ${await where()}`, !(await q("!!document.querySelector('dialog[open]')")) && (await where()).startsWith("/recipes/chicken-marsala/"));
await go("/recipes/"); await sleep(300);
await q("document.querySelector('.card__link[href=\"/recipes/chicken-marsala/\"]').click()"); await sleep(900);
await q("[...document.querySelectorAll('a')].find(a => a.textContent.includes('Chicken Pot Pie') && a.closest('.pager, nav, .recipe-nav, .next-prev') || a.getAttribute('href') === '/recipes/chicken-pot-pie/').click()"); await sleep(900);
await esc();
check(`from one recipe to the next, Esc still goes to the list: ${await where()}`, (await where()) === "/recipes/");
await q("localStorage.clear()");

// ---------- Layout, both themes ----------
for (const theme of ["dark", "light"]) {
  for (const [w, h, label] of [[390, 844, "phone"], [1280, 900, "desktop"]]) {
    await size(w, h);
    for (const path of ["/cocktails/", "/cocktails/demogorgon/"]) {
      await go(path); await q(`localStorage.setItem('hawkins:theme', '${theme}')`); await go(path); await sleep(300);
      check(`${theme} ${label} ${path}: fits`, await q(fits));
    }
    await shot(`cocktails-${theme}-${label}`);
  }
}
for (const w of [320, 360, 800]) {
  await size(w, 900);
  for (const path of ["/cocktails/", "/cocktails/friends-dont-lie/"]) { await go(path); check(`${w}px ${path}: no sideways scroll`, await q(fits)); }
}
await q("localStorage.removeItem('hawkins:theme')");

// ---------- The home page card, and the nav ----------
await size(390, 844);
await go("/");
check("home: the Cocktails file card links to /cocktails/ and counts 3 cocktails", await q(`(() => { const a = [...document.querySelectorAll('.files .file__link')].find(a => a.textContent === 'Cocktails'); if (!a) return false; const f = a.closest('.file'); return a.getAttribute('href') === '/cocktails/' && f.querySelector('.file__status').textContent.replace(/\\s+/g, ' ').trim() === '3 cocktails →' && f.querySelector('.eyebrow').textContent === 'File 003'; })()`));
check(`home: live files numbered in order, then the ones coming: ${await q("[...document.querySelectorAll('.files > .file:not(.is-soon) .eyebrow')].map(e => e.textContent).join()")} / ${await q("[...document.querySelectorAll('.soon-list__item')].map(e => e.textContent.replace(/\\s+/g, ' ').trim()).join(', ')")}`,
  (await q("[...document.querySelectorAll('.files > .file:not(.is-soon) .eyebrow')].map(e => e.textContent).join()")) === "File 001,File 002,File 003,File 004"
  && (await q("[...document.querySelectorAll('.soon-list__item')].map(e => e.textContent.replace(/\\s+/g, ' ').trim()).join(', ')")) === "005 Watchlist, 006 Healthy Fast Food");
check("home: Cocktails isn't in Coming soon any more", await q("![...document.querySelectorAll('.soon-list__item')].some(e => e.textContent.includes('Cocktails'))"));
await go("/cocktails/");
check("the menu marks Cocktails as the current page", await q("document.querySelector('[data-nav-menu] a[href=\"/cocktails/\"]').getAttribute('aria-current') === 'page'"));
await go("/cocktails/demogorgon/");
check("and marks it on a cocktail's page too", await q("document.querySelector('[data-nav-menu] a[href=\"/cocktails/\"]').getAttribute('aria-current') === 'true'"));
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
