// The header's Menu button on phones: the section links move into a dropdown, the Packing percent
// and a dot ride along, it opens and closes like the Cooking menu (and never both at once), and the
// header fits on one line at every width, in every state.
import { open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = ev;
const size = (width, height = 800) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: width < 700 ? 2 : 1, mobile: width < 700 });
const fits = "document.documentElement.scrollWidth <= document.documentElement.clientWidth";
const toggle = "document.querySelector('[data-nav-menu-toggle]')";
const menu = "document.querySelector('[data-nav-menu]')";
const open_ = () => q(`!${menu}.hidden`);
const shown = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; })()`;
const tap = async (selector) => {
  const box = await q(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error(`nothing to tap: ${selector}`);
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  await sleep(300);
};
const key = async (k) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k }); await sleep(100);
};
const fresh = async (path) => { await go("/"); await q("localStorage.clear(); sessionStorage.clear()"); await go(path); };
// A trip in progress, the way the packing tests save one.
const trip = (progress) => q(`localStorage.setItem('hawkins:packing', JSON.stringify({ days: 3, kits: [], checked: [], skipped: [], extras: [], progress: ${JSON.stringify(progress)} }))`);
const sectionLinks = "[...document.querySelectorAll('.site-nav__section a')]";

// ---------- Phone: links hidden, Menu shown ----------
await size(390, 844);
await fresh("/recipes/");
check("phone: the section links are hidden", await q(`${sectionLinks}.length === 3 && ${sectionLinks}.every(a => a.getBoundingClientRect().width === 0)`));
check("phone: Menu is shown, with an icon, the label and aria wiring", await q(shown("[data-nav-menu-toggle]")) && await q(`${toggle}.textContent.trim() === 'Menu' && ${toggle}.querySelector('svg[aria-hidden=true]') && ${toggle}.getAttribute('aria-expanded') === 'false' && ${toggle}.getAttribute('aria-controls') === 'nav-menu' && ${toggle}.type === 'button'`));
check("phone: brand and Plan stay in the bar", await q(shown(".brand")) && await q(shown(".site-nav a[href=\"/plan/\"]")));
check("phone: Menu is the last thing in the bar, after the pot", await q("document.querySelector('.site-nav > ul > li:last-child').classList.contains('nav-menu') && document.querySelector('.site-nav > ul > li:nth-last-child(2)').classList.contains('cooking-nav')"));
check("phone: the menu starts closed", !(await open_()) && !(await q(shown("[data-nav-menu]"))));

// ---------- Open and close ----------
await tap("[data-nav-menu-toggle]");
check("click opens it: aria-expanded true, list shown", (await open_()) && (await q(`${toggle}.getAttribute('aria-expanded')`)) === "true" && await q(shown("[data-nav-menu]")));
check("opening focuses the first link", await q(`document.activeElement === ${menu}.querySelector('a')`));
check("it lists Recipes, Packing, Caffeine with their file numbers", (await q(`[...${menu}.querySelectorAll('a')].map(a => a.querySelector('.nav-menu__file').textContent + ' ' + a.textContent.replace(/\\s+/g, ' ').trim().slice(3).trim()).join(' | ')`)).replace(/\s+/g, " ") === "001 Recipes | 002 Packing | 006 Caffeine"
  && (await q(`[...${menu}.querySelectorAll('a')].map(a => a.getAttribute('href')).join()`)) === "/recipes/,/packing/,/caffeine/");
check("Recipes is marked as the current page; the others aren't", await q(`[...${menu}.querySelectorAll('a')].map(a => a.getAttribute('aria-current')).join() === 'page,,'`));
check("the current row looks different, rows are tall enough to tap", await q(`(() => { const [a, b] = ${menu}.querySelectorAll('a'); return getComputedStyle(a).color !== getComputedStyle(b).color && getComputedStyle(a).borderLeftColor !== getComputedStyle(b).borderLeftColor && [...${menu}.querySelectorAll('a')].every(x => x.getBoundingClientRect().height >= 44); })()`));
check("Plan isn't in the menu", await q(`!${menu}.querySelector('a[href="/plan/"]')`));
await tap("[data-nav-menu-toggle]");
check("click again closes it", !(await open_()) && (await q(`${toggle}.getAttribute('aria-expanded')`)) === "false");
await tap("[data-nav-menu-toggle]");
await key("Escape");
check("Escape closes it and returns focus to Menu", !(await open_()) && await q(`document.activeElement === ${toggle}`) && (await q(`${toggle}.getAttribute('aria-expanded')`)) === "false");
await tap("[data-nav-menu-toggle]");
await tap("main, .container");
check("tapping elsewhere closes it", !(await open_()));
await tap("[data-nav-menu-toggle]");
await tap("[data-nav-menu] a[href=\"/packing/\"]");
await sleep(600);
check(`a link click goes there (${await q("location.pathname")}) and the menu is closed`, (await q("location.pathname")) === "/packing/" && !(await open_()) && (await q(`${toggle}.getAttribute('aria-expanded')`)) === "false");
check("Packing is the current row there", await q(`${menu}.querySelector('a[href="/packing/"]').getAttribute('aria-current') === 'page'`));

// ---------- After a page change it's closed, and nothing doubles up ----------
await go("/");
await q("window.__sameTab = 1");
await tap("[data-nav-menu-toggle]");
await q("HawkinsPage.visit('/recipes/')"); await sleep(1200);
check("after a Turbo page change the menu is closed", await q("window.__sameTab === 1") && !(await open_()) && (await q(`${toggle}.getAttribute('aria-expanded')`)) === "false");
await tap("[data-nav-menu-toggle]");
check("and it opens again, once (a click doesn't toggle twice)", await open_());
await key("Escape");

// ---------- The Packing percent and the dot ----------
await fresh("/recipes/");
check("no trip: no percent in the menu, no dot", await q(`${menu}.querySelector('[data-packing-count]').hidden && !${toggle}.hasAttribute('data-badge')`) && !(await q(shown(".nav-menu__dot"))));
await trip({ packed: 1, skipped: 0, total: 4 });
await go("/recipes/");
await tap("[data-nav-menu-toggle]");
check("a trip in progress: 25% inside the menu (and in the bar's link too), and the dot shows", await q(`(() => { const b = ${menu}.querySelector('[data-packing-count]'); return !b.hidden && b.textContent === '25%' && getComputedStyle(b).display !== 'none'; })()`)
  && (await q("[...document.querySelectorAll('[data-packing-count]')].map(b => b.textContent).join()")) === "25%,25%" && await q(`${toggle}.hasAttribute('data-badge')`) && await q(shown(".nav-menu__dot")));
await shot("nav-menu-trip-390");
await trip({ packed: 4, skipped: 0, total: 4 });
await go("/recipes/");
check("everything decided: no percent, no dot", await q(`${menu}.querySelector('[data-packing-count]').hidden && !${toggle}.hasAttribute('data-badge')`) && !(await q(shown(".nav-menu__dot"))));

// ---------- One menu at a time ----------
await fresh("/recipes/banana-bread/");
await q("document.querySelectorAll('.step__num')[1].click()"); await sleep(300);
check("a recipe started: the pot shows", !(await q("document.querySelector('[data-cooking]').hidden")));
const cooking = "document.querySelector('[data-cooking-menu]')";
await tap("[data-cooking-toggle]");
check("the Cooking menu opens", !(await q(`${cooking}.hidden`)));
await tap("[data-nav-menu-toggle]");
check("opening Menu closes the Cooking menu", (await open_()) && (await q(`${cooking}.hidden`)) && (await q("document.querySelector('[data-cooking-toggle]').getAttribute('aria-expanded')")) === "false");
await tap("[data-cooking-toggle]");
check("opening the Cooking menu closes Menu", !(await open_()) && !(await q(`${cooking}.hidden`)) && (await q(`${toggle}.getAttribute('aria-expanded')`)) === "false");
await key("Escape");
check("Escape closes the Cooking menu as before", await q(`${cooking}.hidden`));
// The pot's first-time note ("Lost your place?") hangs under the pot on other pages; it mustn't cover Menu's list.
await tap("[data-cooking-toggle]"); await key("Escape");
await q("localStorage.removeItem('hawkins:cooking-hint')");
await go("/caffeine/");
check("the pot's note shows on another page", await q("!!document.querySelector('[data-cooking-hint]')"));
await tap("[data-nav-menu-toggle]");
check("with Menu open, the note doesn't cover the links", await q(`(() => { const a = ${menu}.querySelector('a[href="/recipes/"]').getBoundingClientRect(); const e = document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2); return !!e.closest('[data-nav-menu]'); })()`));
await key("Escape");
check("and the note is back when it closes", await q("getComputedStyle(document.querySelector('[data-cooking-hint]')).display !== 'none'"));

// ---------- Screenshots of the open menu at 360 ----------
await size(360, 740);
for (const theme of ["dark", "light"]) {
  await fresh("/caffeine/");
  await q(`localStorage.setItem('hawkins:theme', '${theme}')`);
  await trip({ packed: 30, skipped: 6, total: 50 });
  await go("/caffeine/");
  await tap("[data-nav-menu-toggle]");
  check(`${theme} 360: the open menu is on screen, under the header, with Caffeine marked`, await q(`(() => { const r = ${menu}.getBoundingClientRect(); const h = document.querySelector('.site-header').getBoundingClientRect(); return r.left >= 8 && r.right <= innerWidth - 8 && r.top >= h.bottom && r.bottom < innerHeight; })()`)
    && await q(`${menu}.querySelector('a[aria-current=page]').getAttribute('href') === '/caffeine/'`));
  await shot(`nav-menu-open-360-${theme}`);
}
await q("localStorage.removeItem('hawkins:theme')");

// ---------- Desktop: links shown, no Menu ----------
for (const w of [900, 1280]) {
  await size(w, 800);
  await fresh("/recipes/");
  check(`${w}px: the section links show and Menu doesn't`, await q(`${sectionLinks}.every(a => a.getBoundingClientRect().width > 0)`) && !(await q(shown(".nav-menu"))) && !(await q(shown("[data-nav-menu]"))));
}
// Widening the window with the menu open closes it.
await size(390, 800);
await fresh("/recipes/");
await tap("[data-nav-menu-toggle]");
await size(1000, 800); await sleep(200);
check("widening past the phone layout closes the menu", !(await open_()));

// ---------- The fit matrix: one line, nothing cut off, every width and state ----------
const states = {
  "nothing": "",
  "Plan 12": "const p = document.querySelector('[data-plan-count]'); p.textContent = '12'; p.hidden = false;",
  "the pot": "document.querySelector('[data-cooking]').hidden = false;",
  "everything": "const p = document.querySelector('[data-plan-count]'); p.textContent = '12'; p.hidden = false; document.querySelector('[data-cooking]').hidden = false; document.querySelectorAll('[data-packing-count]').forEach(b => { b.textContent = '99%'; b.hidden = false }); document.querySelector('[data-nav-menu-toggle]').setAttribute('data-badge', '');",
};
for (const w of [320, 360, 375, 390, 430, 640, 641, 700, 768, 832, 833, 1024, 1280]) {
  await size(w, 800);
  const bad = [];
  for (const [name, js] of Object.entries(states)) {
    await go("/recipes/"); await q("localStorage.clear()"); await go("/recipes/");
    await q(js); await sleep(50);
    const r = await q(`(() => { const nav = document.querySelector('.site-nav').getBoundingClientRect(); const bar = document.querySelector('.site-header__inner').getBoundingClientRect();
      const brand = document.querySelector('.brand').getBoundingClientRect();
      return { scroll: document.documentElement.scrollWidth, height: bar.height, right: nav.right, gap: nav.left - brand.right,
        tall: [...document.querySelectorAll('.site-nav > ul > li')].filter(li => li.offsetParent).some(li => li.getBoundingClientRect().height >= 46) }; })()`);
    if (r.scroll > w || r.height >= 70 || r.right > w - 8 || r.gap < 0 || r.tall) bad.push(`${name}: ${JSON.stringify(r)}`);
  }
  check(`${w}px: the header is one line and fits in all 4 states${bad.length ? " -- " + bad.join("; ") : ""}`, bad.length === 0);
}
await size(320, 700);
await go("/recipes/");
await q(states.everything);
await shot("nav-header-320-everything");

check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
