// Caffeine: the drinks data, the cards on /caffeine/ (names, flavors, how to order at each shop,
// the per-shop extras (foam top, tips), 4:5 photos), the layout at phone and desktop widths, and its file card on the home page.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = ev;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const size = (width, height = 900, mobile = width < 700) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
const fits = "document.documentElement.scrollWidth <= document.documentElement.clientWidth";

// ---------- The data ----------
// Read _data/drinks.yml itself (Ruby ships with every machine that builds the site).
const data = JSON.parse(execFileSync("ruby", ["-ryaml", "-rjson", "-e", "puts JSON.generate(YAML.load_file(ARGV[0]))", join(ROOT, "_data", "drinks.yml")], { encoding: "utf8" }));
const shops = data.shops;
const drinks = data.drinks;
const shopIds = shops.map((s) => s.id);
check(`${shops.length} shops with an id, name, base and top; ids unique`, shops.every((s) => s.id && s.name && s.base && s.top) && new Set(shopIds).size === shops.length);
check(`${drinks.length} drinks, ids and names unique`, drinks.length === 5 && new Set(drinks.map((d) => d.id)).size === drinks.length && new Set(drinks.map((d) => d.name.toLowerCase())).size === drinks.length);
const flavorSet = (d) => d.flavors.map((f) => f.toLowerCase()).sort().join("|");
check("no two drinks have the same flavors (any order, any case)", new Set(drinks.map(flavorSet)).size === drinks.length);
check("every drink has flavors and a style of iced or blended", drinks.every((d) => d.flavors.length > 0 && ["iced", "blended"].includes(d.style)));
check("every shop_names and shop_notes key is a real shop id", drinks.every((d) => [...Object.keys(d.shop_names || {}), ...Object.keys(d.shop_notes || {})].every((id) => shopIds.includes(id))));
check("sugar_free and top are true when present", drinks.every((d) => (d.sugar_free === undefined || d.sugar_free === true) && (d.top === undefined || d.top === true)));
const photoFiles = (d) => { const base = d.photo.replace(/\.jpg$/, ""); return [d.photo, `${base}.webp`, `${base}-800.webp`, `${base}-480.webp`]; };
check("every photo has its JPG and 3 WebP copies", drinks.filter((d) => d.photo).every((d) => d.photo.endsWith(".jpg") && d.photo_alt && photoFiles(d).every((f) => existsSync(join(ROOT, f)))));

// ---------- The page ----------
const text = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => e.textContent.replace(/\\s+/g, ' ').trim())`;
await size(390, 844);
await go("/caffeine/");
check(`title: ${await q("document.title")}`, (await q("document.title")) === "Caffeine · Hawkins");
check("eyebrow, title and lede", (await q("document.querySelector('.eyebrow').textContent")) === "File 004 · Fuel" && (await q("document.querySelector('.page-title').textContent")) === "Caffeine"
  && (await q("document.querySelector('.page-head__lede').textContent")) === "Our favorite energy drink flavor combos, each with its own Hawkins name, and how to order it at Dutch Bros or Aroma Joe's.");
check("5 cards, in file order, with their ids", (await q("[...document.querySelectorAll('.drink')].map(a => a.id).join()")) === "lifeguard,hawkins,demobat,the-upside-down,madmax");
check("names are links to the card", (await q(text(".drink__name"))).join() === "Lifeguard,Hawkins,Demobat,The Upside Down,MADMAX" && (await q("[...document.querySelectorAll('.drink__name a')].map(a => a.getAttribute('href')).join()")) === "#lifeguard,#hawkins,#demobat,#the-upside-down,#madmax"
  && await q("getComputedStyle(document.querySelector('.drink__name')).fontFamily.includes('Libre Baskerville')"));
check(`flavors: ${(await q(text(".drink__flavors"))).join(" | ")}`, (await q(text(".drink__flavors"))).join(" | ") === "Passion Fruit · Strawberry · Lime | Blackberry · Cherry · Grape | Strawberry · Pomegranate | Blue Raspberry · Red Raspberry | Orange · Lemon · Blackberry");
check("style lines", (await q(text(".drink__style"))).join() === "Iced,Iced,Iced,Iced,Iced");
const orders = (id) => q(`[...document.querySelectorAll('#${id} .drink__order')].map(r => r.querySelector('dt').textContent + ': ' + r.querySelector('dd').textContent).join(' | ')`);
check(`Lifeguard: ${await orders("lifeguard")}`, (await orders("lifeguard")) === "Dutch Bros: “Galaxy Fish” | Aroma Joe's: Rush with passion fruit, strawberry, lime");
check(`Hawkins: ${await orders("hawkins")}`, (await orders("hawkins")) === "Dutch Bros: Rebel with blackberry, cherry, grape | Aroma Joe's: “Amethyst”");
check(`Demobat: ${await orders("demobat")}`, (await orders("demobat")) === "Dutch Bros: “Vampire Slayer” | Aroma Joe's: Rush with strawberry, pomegranate");
check(`MADMAX: ${await orders("madmax")}`, (await orders("madmax")) === "Dutch Bros: Rebel with orange, lemon, blackberry | Aroma Joe's: “Black Jack”");
check(`The Upside Down: ${await orders("the-upside-down")}`, (await orders("the-upside-down")) === "Dutch Bros: “Dragon Slayer” | Aroma Joe's: Rush with blue raspberry, red raspberry");
// Anything about one shop sits in that shop's row: the foam top in its word, and a tip.
const extras = (id) => q(`[...document.querySelectorAll('#${id} .drink__order')].map(r => r.querySelector('dt').textContent + ': ' + [...r.querySelectorAll('.drink__extra')].map(e => e.textContent).join(' / ')).join(' | ')`);
check(`Hawkins' foam top, per shop: ${await extras("hawkins")}`, (await extras("hawkins")) === "Dutch Bros: Also good with a Soft Top | Aroma Joe's: Also good with a Cloud Top");
check(`Demobat's sour tip, under Dutch Bros only: ${await extras("demobat")}`, (await extras("demobat")) === "Dutch Bros: Sour shots make it sweeter. | Aroma Joe's: ");
check(`The Upside Down's float, under Dutch Bros only: ${await extras("the-upside-down")}`, (await extras("the-upside-down")) === "Dutch Bros: Comes with a blackberry float. | Aroma Joe's: ");
check(`no extras on Lifeguard: ${await extras("lifeguard")}`, (await extras("lifeguard")) === "Dutch Bros:  | Aroma Joe's: ");
check("nothing about a shop trails after the order lines", await q("[...document.querySelectorAll('.drink__body')].every(b => b.lastElementChild.matches('dl.drink__orders'))"));
check("order rows are a description list, one row per shop", await q("document.querySelectorAll('dl.drink__orders').length === 5 && [...document.querySelectorAll('.drink__orders')].every(dl => dl.querySelectorAll('dt').length === 2 && dl.querySelectorAll('dd:not(.drink__extra)').length === 2)"));
check("shop labels are small mono capitals", await q("(() => { const s = getComputedStyle(document.querySelector('.drink__orders dt')); return s.textTransform === 'uppercase' && s.fontFamily.includes('Courier') && parseFloat(s.fontSize) <= 13; })()"));
check("an extra is quieter than its order line", await q("(() => { const e = getComputedStyle(document.querySelector('.drink__extra')), d = getComputedStyle(document.querySelector('#hawkins .drink__order dd')); return parseFloat(e.fontSize) < parseFloat(d.fontSize) && e.color !== d.color; })()"));
check("no sugar-free line unless the drink is sugar-free", await q("!document.body.textContent.includes('Sugar-free')"));

// ---------- Photos: 4:5, loaded, graded like the recipe photos ----------
await q("document.querySelectorAll('img[loading=lazy]').forEach(i => i.scrollIntoView())"); await sleep(600);
check("Demobat has no photo yet: the placeholder, no grade, no WebP", await q("(() => { const m = document.querySelector('#demobat .drink__media'); const i = m.querySelector('img'); return !m.classList.contains('is-photo') && !m.querySelector('source') && i.getAttribute('src') === '/assets/images/drink-placeholder.svg' && i.alt === ''; })()"));
check("photos are 4:5 and loaded", await q(`[...document.querySelectorAll('.drink__media')].every(m => { const r = m.getBoundingClientRect(); const i = m.querySelector('img'); return Math.abs(r.width / r.height - 0.8) < 0.01 && i.complete && i.naturalWidth > 0; })`));
check("img has size attributes, alt, and a WebP source; only the first isn't lazy", await q(`[...document.querySelectorAll('.drink__media.is-photo img')].every((i, n) => i.width > 0 && i.getAttribute('width') === '960' && i.getAttribute('height') === '1200' && i.alt.length > 10 && (i.loading === 'lazy') === (n > 0))
  && [...document.querySelectorAll('.drink__media picture source')].every(s => s.type === 'image/webp' && /-480\\.webp 480w, .*-800\\.webp 800w, .*\\.webp 960w/.test(s.srcset))`));
check("photos get the site's grade", await q("[...document.querySelectorAll('.drink__media')].filter(m => m.querySelector('picture')).every(m => m.classList.contains('is-photo'))"));
check("the browser picks a WebP", await q("[...document.querySelectorAll('.drink__media.is-photo img')].every(i => /\\.webp$/.test(i.currentSrc))"));

// ---------- Anchors ----------
await go("/caffeine/#hawkins");
await sleep(400);
check("/caffeine/#hawkins scrolls the card into view under the sticky header", await q(`(() => { const r = document.getElementById('hawkins').getBoundingClientRect(); const h = document.querySelector('.site-header').getBoundingClientRect().bottom; return r.top >= h && r.top < h + 60 && scrollY > 0; })()`));

// ---------- Layout ----------
// Counted from the grid itself, since 2 cards never fill 3 columns.
const columns = () => q("getComputedStyle(document.querySelector('.drink-grid')).gridTemplateColumns.split(' ').length");
const equalGap = () => q("(() => { const [a, b] = [...document.querySelectorAll('.drink')].map(e => e.getBoundingClientRect()); return a.top === b.top ? Math.round(b.left - a.right) : Math.round(b.top - a.bottom); })()");
for (const [w, cols] of [[320, 1], [360, 1], [390, 1], [800, 2], [1280, 3]]) {
  await size(w, 900);
  await go("/caffeine/");
  check(`${w}px: ${cols} column${cols > 1 ? "s" : ""}, no sideways scroll, the cards inside the page`, (await columns()) === cols && await q(fits)
    && await q("[...document.querySelectorAll('.drink')].every(a => { const r = a.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })"));
}
check("cards in the same container as the heading, and as wide as the other pages' (72rem)", await q("(() => { const c = document.querySelector('.drink-grid').parentElement; const g = document.querySelector('.drink-grid').getBoundingClientRect(); const p = document.querySelector('.page-head').getBoundingClientRect(); return c.classList.contains('container') && g.left === p.left && g.right === p.right && c.getBoundingClientRect().width <= 1152; })()"));
check(`the gap matches the recipe cards' (${await equalGap()}px)`, (await equalGap()) >= 16 && (await equalGap()) <= 24);

// ---------- Both themes, phone and desktop ----------
for (const theme of ["dark", "light"]) {
  for (const [w, h, label] of [[390, 844, "phone"], [1280, 900, "desktop"]]) {
    await size(w, h);
    await go("/caffeine/"); await q(`localStorage.setItem('hawkins:theme', '${theme}')`); await go("/caffeine/");
    await q("document.querySelectorAll('img[loading=lazy]').forEach(i => i.scrollIntoView()); scrollTo(0, 0)"); await sleep(500);
    check(`${theme} ${label}: fits, text readable on the card`, await q(fits) && await q("(() => { const c = getComputedStyle(document.querySelector('.drink')); return c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.borderTopWidth === '1px'; })()"));
    await shot(`caffeine-${theme}-${label}`);
  }
}
await q("localStorage.removeItem('hawkins:theme')");

// ---------- Without a photo: the placeholder, in the same 4:5 frame ----------
await size(390, 844);
await go("/caffeine/");
await q(`(() => { const m = document.querySelector('#lifeguard .drink__media'); m.classList.remove('is-photo'); m.innerHTML = '<img src="/assets/images/drink-placeholder.svg" alt="" width="960" height="1200">'; })()`);
await sleep(300);
check("the placeholder fills the same 4:5 frame", await q("(() => { const m = document.querySelector('#lifeguard .drink__media'); const i = m.querySelector('img'); const r = m.getBoundingClientRect(); return i.complete && i.naturalWidth > 0 && Math.abs(r.width / r.height - 0.8) < 0.01; })()"));

// ---------- The home page card, and the nav ----------
await go("/");
check("home: the Caffeine file card links to /caffeine/ and counts 5 drinks", await q(`(() => { const a = [...document.querySelectorAll('.files .file__link')].find(a => a.textContent === 'Caffeine'); if (!a) return false; const f = a.closest('.file'); return a.getAttribute('href') === '/caffeine/' && f.querySelector('.file__status').textContent.replace(/\\s+/g, ' ').trim() === '5 drinks →' && f.querySelector('.eyebrow').textContent === 'File 004'; })()`));
check("home: Caffeine isn't in Coming soon any more", await q("![...document.querySelectorAll('.soon-list__item')].some(e => e.textContent.includes('Caffeine'))"));
await go("/caffeine/");
check("the menu marks Caffeine as the current page", await q("document.querySelector('[data-nav-menu] a[href=\"/caffeine/\"]').getAttribute('aria-current') === 'page'"));
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
