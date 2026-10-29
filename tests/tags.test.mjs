// The recipe finder: dishes and tags picked from the search box's suggestions,
// as pills, alone and together, and the dish groups they narrow.
import { open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const visible = "[...document.querySelectorAll('.card')].filter(c => !c.hidden).map(c => c.querySelector('.card__title').textContent.trim())";
const status = "document.querySelector('[data-status]').textContent";
const url = "location.search";
const tokens = "[...document.querySelectorAll('.token')].map(t => t.firstChild.textContent).join(', ')";
const offered = "[...document.querySelectorAll('.suggest .chip:not([hidden])')].map(c => c.dataset.label).join(', ')";
const suggestOpen = "!document.querySelector('[data-suggest]').hidden";
const groups = "[...document.querySelectorAll('.dish-group:not([hidden]) .dish-group__title')].map(h => h.textContent.replace(/\\s+/g, ' ').trim()).join(' | ')";
const everyCard = (test) => ev(`[...document.querySelectorAll('.card:not([hidden])')].every(c => ${test})`);
// A real tap (not element.click()), so focus and blur happen the way they do on a phone.
const tap = async (selector) => {
  const box = await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error(`nothing to tap: ${selector}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  await sleep(200);
};
const key = async (k, code) => {
  for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: code });
  await sleep(150);
};
const type = async (text) => { for (const ch of text) await send("Input.insertText", { text: ch }); await sleep(150); };

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await go("/recipes/");
check(`initial: ${await ev(status)}, suggestions closed`, (await ev(status)) === "46 recipes" && !(await ev(suggestOpen)));
check(`grouped by dish: ${await ev(groups)}`, /^Dinner \d+ \| Soup \d+ \| Side \d+ \| Appetizer \d+ \| Breakfast \d+ \| Dessert \d+ \| Sauce \d+$/.test(await ev(groups)));

await tap("#recipe-search");
check(`tap search -> suggestions: ${await ev(offered)}`, await ev(suggestOpen) && /Dinner/.test(await ev(offered)) && /Feeds a crowd/.test(await ev(offered)));
await shot("finder-open-mobile");
await tap('.suggest .chip[data-category="dessert"]');
check(`pick Dessert -> pill ${await ev(tokens)}, ${await ev(url)}, closed`, (await ev(tokens)) === "Dessert" && (await ev(url)) === "?category=dessert" && !(await ev(suggestOpen)));
check(`only the Dessert group: ${await ev(groups)}`, /^Dessert \d+$/.test(await ev(groups)) && await everyCard("c.dataset.category === 'dessert'"));

await tap("#recipe-search");
const forDessert = await ev(offered);
check(`with Dessert, offers other dishes and only tags desserts have: ${forDessert}`, !/Dessert/.test(forDessert) && /Dinner/.test(forDessert) && !/Slow Cooker/.test(forDessert));
await tap('.suggest .chip[data-tag="quick"]');
check(`+ Quick -> ${await ev(tokens)} | ${await ev(url)}`, (await ev(tokens)) === "Dessert, Quick" && (await ev(url)) === "?category=dessert&tag=quick"
  && await everyCard("c.dataset.category === 'dessert' && c.dataset.tags.split(' ').includes('quick')"));
await shot("finder-pills-mobile");
await tap('.token[data-kind="category"]');
check(`tap the Dessert pill removes it: ${await ev(tokens)} | ${await ev(url)}`, (await ev(tokens)) === "Quick" && (await ev(url)) === "?tag=quick");

// Typing narrows the suggestions; Enter takes the only one left.
await tap("#recipe-search");
await type("veg");
check(`"veg" suggests ${await ev(offered)}`, (await ev(offered)) === "Vegetarian");
await key("Enter", 13);
check(`Enter -> ${await ev(tokens)}, box empty, ${await ev(url)}`, (await ev(tokens)) === "Quick, Vegetarian" && (await ev("document.querySelector('#recipe-search').value")) === "" && (await ev(url)) === "?tag=quick&tag=vegetarian");
await tap("#recipe-search");
await key("Backspace", 8);
check(`Backspace in an empty box removes the last pill: ${await ev(tokens)}`, (await ev(tokens)) === "Quick");
await key("Escape", 27);
check("Escape closes the suggestions", !(await ev(suggestOpen)));
await tap('.token[data-kind="tag"]');

// Words that found a suggestion go into the pill; the rest stay a search.
await tap("#recipe-search");
await type("chicken din");
check(`"chicken din" suggests ${await ev(offered)}`, (await ev(offered)) === "Dinner");
await tap('.suggest .chip[data-category="dinner"]');
check(`-> pill ${await ev(tokens)}, search "${await ev("document.querySelector('#recipe-search').value")}", ${await ev(url)}`,
  (await ev(tokens)) === "Dinner" && (await ev(url)) === "?q=chicken&category=dinner" && (await ev(visible)).length > 0);

// From the URL: an old single-tag link, and a dead end.
await go("/recipes/?tag=low-calorie");
check(`?tag=low-calorie: ${await ev(visible)} | pill ${await ev(tokens)}`, (await ev(visible)).join() === "Cottage Cheese Bagels" && (await ev(tokens)) === "Low Calorie");
await go("/recipes/?tag=slow-cooker&tag=low-calorie");
check(`dead end: ${await ev("document.querySelector('[data-empty-text]').textContent")}`, !(await ev("document.querySelector('[data-empty]').hidden")) && /Slow Cooker \+ Low Calorie/.test(await ev("document.querySelector('[data-empty-text]').textContent")));
await tap("[data-clear]");
check(`clear resets everything: ${await ev(status)} | ${await ev(tokens) || "no pills"}`, (await ev(status)) === "46 recipes" && (await ev(tokens)) === "");

// Search still finds recipes by tag name, and recipe pages link to their tags.
await go("/recipes/?q=low+calorie");
check(`search "low calorie": ${await ev(visible)}`, (await ev(visible)).join() === "Cottage Cheese Bagels");
await go("/recipes/cottage-cheese-bagels/");
check(`recipe eyebrow: ${await ev("document.querySelector('.recipe-hero .eyebrow').textContent.replace(/\\s+/g,' ').trim()")}`, /Breakfast Low Calorie/.test(await ev("document.querySelector('.recipe-hero .eyebrow').textContent.replace(/\\s+/g,' ').trim()")));
check(`calories: ${await ev("[...document.querySelectorAll('.stat')].map(s => s.textContent.replace(/\\s+/g,' ').trim()).join(' | ')")}`, /CALORIES 186/i.test(await ev("[...document.querySelectorAll('.stat')].map(s => s.textContent.replace(/\\s+/g,' ').trim()).join(' | ')")));
await shot("bagels-mobile");
await ev("document.querySelector('.recipe-hero .tag').click()"); await sleep(1300);
check(`tag link -> ${await ev("location.pathname + location.search")}: ${await ev(visible)}`, (await ev(visible)).join() === "Cottage Cheese Bagels");
check("fits", await ev("document.documentElement.scrollWidth <= innerWidth"));

await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/recipes/");
await shot("finder-desktop");
await tap("#recipe-search");
await shot("finder-desktop-open");
check(`JS errors: ${errors.length} ${errors.join(' | ')}`, errors.length === 0);
finish();
