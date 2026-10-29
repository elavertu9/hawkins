// Meal plan extras: pantry items, your own items, In the cart, sharing, and undo.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
const q = ev;
await send("Browser.grantPermissions", { origin: BASE, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
const rowSel = (name) => `[...document.querySelectorAll('[data-plan-aisles] li')].find(li => li.querySelector('.shopping__name').textContent === ${JSON.stringify(name)})`;
const qtyOf = (name) => q(`(() => { const li = ${rowSel(name)}; return li ? li.querySelector('.qty').textContent : null; })()`);
const pantryNames = "[...document.querySelectorAll('[data-plan-pantry-list] .shopping__name')].map(e => e.textContent).join(', ')";
const toastText = "document.querySelector('[data-plan-toast-text]').textContent";
const undo = async () => { await q("document.querySelector('[data-plan-toast-action]').click()"); await sleep(200); };
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.bringToFront");
await go("/plan/"); await q("localStorage.clear()");
await q(`localStorage.setItem('hawkins:plan', JSON.stringify({recipes: [{slug:'beef-and-broccoli',scale:1},{slug:'goulash',scale:2}], checked: []}))`);
await go("/plan/");
// 5. units
check(`garlic: ${await qtyOf("garlic")}`, (await qtyOf("garlic")) === "2⅔ tablespoons");
const pantryQty = (name) => q(`(() => { const li = [...document.querySelectorAll('[data-plan-pantry-list] li')].find(li => li.querySelector('.shopping__name').textContent === ${JSON.stringify(name)}); return li ? li.querySelector('.qty').textContent : null; })()`);
check(`olive oil (in pantry): ${await pantryQty("olive oil")}`, (await pantryQty("olive oil")) === "¼ cup");
check(`soy sauce stays: ${await qtyOf("low-sodium soy sauce")}`, (await qtyOf("low-sodium soy sauce")) === "6 tablespoons");
check(`ground beef: ${await qtyOf("lean ground beef")}`, (await qtyOf("lean ground beef")) === "4 pounds");
// 1. pantry defaults
check(`pantry defaults: ${await q(pantryNames)} | black pepper on list: ${await qtyOf("black pepper")}`, (await q(pantryNames)).includes("black pepper") && (await qtyOf("black pepper")) === null);
await q(`${rowSel("broccoli")}.querySelector('.shopping__action').click()`); await sleep(200);
check(`broccoli -> pantry: ${await q(pantryNames)} | toast "${await q(toastText)}"`, (await q(pantryNames)).includes("broccoli") && (await qtyOf("broccoli")) === null);
await undo();
check("undo pantry move", (await qtyOf("broccoli")) === "1 pound");
await q(`[...document.querySelectorAll('[data-plan-pantry-list] li')].find(li => li.querySelector('.shopping__name').textContent === 'black pepper').querySelector('.shopping__action').click()`); await sleep(200);
check(`Need it -> black pepper back: ${await qtyOf("black pepper")}`, (await qtyOf("black pepper")) === "¼ teaspoon");
await go("/plan/");
check("pantry persists after reload", (await qtyOf("black pepper")) === "¼ teaspoon");
// 2. extras
const addExtra = async (text) => { await q(`(() => { const i = document.querySelector('[data-plan-extra-input]'); i.value = ${JSON.stringify(text)}; i.form.requestSubmit(); })()`); await sleep(200); };
await addExtra("paper towels"); await addExtra("1 gallon milk"); await addExtra("bananas");
const aisleOf = (name) => q(`(() => { const li = ${rowSel(name)}; return li ? li.closest('.aisle').querySelector('h3').textContent + ' / ' + li.querySelector('.shopping__from').textContent : null; })()`);
check(`paper towels: ${await aisleOf("paper towels")}`, (await aisleOf("paper towels")) === "Other / Added by you");
check(`milk: ${await aisleOf("1 gallon milk")}`, (await aisleOf("1 gallon milk"))?.startsWith("Dairy"));
check(`bananas: ${await aisleOf("bananas")}`, (await aisleOf("bananas"))?.startsWith("Produce"));
await q(`${rowSel("paper towels")}.querySelector('.shopping__action').click()`); await sleep(200);
check("remove extra", (await aisleOf("paper towels")) === null);
await undo();
check("undo remove extra", (await aisleOf("paper towels")) !== null);
// 3. checked items move to "In the cart", and come back when unchecked
await q(`${rowSel("broccoli")}.querySelector('input').click()`); await sleep(200);
const cartNames = "[...document.querySelectorAll('[data-plan-cart-list] .shopping__name')].map(e => e.textContent).join(', ')";
check(`checked -> in the cart: ${await q(cartNames)}, gone from produce`, (await q(cartNames)) === "broccoli" && (await qtyOf("broccoli")) === null);
await q("[...document.querySelectorAll('[data-plan-cart-list] li')][0].querySelector('input').click()"); await sleep(200);
check("unchecked -> back in its aisle", (await qtyOf("broccoli")) === "1 pound" && await q("document.querySelector('[data-plan-cart]').hidden"));
await shot("plan2-mobile");
// 6. recipe links
check(`from links: ${await q(`${rowSel("garlic")}.querySelector('.shopping__from a').getAttribute('href')`)}`, (await q(`${rowSel("garlic")}.querySelector('.shopping__from a').getAttribute('href')`)) === "/recipes/beef-and-broccoli/#ingredients-title");
const clickedBox = await q(`(() => { const li = ${rowSel("garlic")}; const before = li.querySelector('input').checked; li.querySelector('.shopping__from a').addEventListener('click', e => e.preventDefault(), { once: true }); li.querySelector('.shopping__from a').click(); return before === li.querySelector('input').checked; })()`);
check("clicking a recipe link doesn't toggle the checkbox", clickedBox);
// 8. clear + undo
await q("document.querySelector('[data-plan-clear]').click()"); await sleep(200);
check(`clear: ${await q("document.querySelectorAll('.plan-item').length")} recipes, toast "${await q(toastText)}"`, (await q("document.querySelectorAll('.plan-item').length")) === 0);
await undo();
check(`undo clear: ${await q("document.querySelectorAll('.plan-item').length")} recipes, extras ${await q("document.querySelectorAll('[data-plan-aisles] .shopping__action--remove').length")}`, (await q("document.querySelectorAll('.plan-item').length")) === 2 && (await q("document.querySelectorAll('[data-plan-aisles] .shopping__action--remove').length")) === 3);
// Share: the list and the plan link together, and the link round-trips with extras
await q("Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })"); // copy instead of the share sheet
await send("Runtime.evaluate", { expression: "document.querySelector('[data-plan-share]').click()", userGesture: true }); await sleep(400);
const text = await q("navigator.clipboard.readText()");
const url = text.match(/^The plan: (\S+)$/m)?.[1];
console.log("share url:", url);
await q("localStorage.removeItem('hawkins:plan')");
await send("Page.navigate", { url }); await sleep(1500);
check(`shared link loads ${await q("document.querySelectorAll('.plan-item').length")} recipes + extras: ${await q("[...document.querySelectorAll('.shopping__action--remove')].map(b => b.closest('li').querySelector('.shopping__name').textContent).join(', ')")}`,
  (await q("document.querySelectorAll('.plan-item').length")) === 2 && (await q("document.querySelectorAll('.shopping__action--remove').length")) === 3);
// The shared text leaves out pantry items, and includes extras
console.log(text);
check(`copy lists pantry items under "Probably have", not in the list, and includes extras: salt=${/\bsalt\b(?! )/.test(text) && /- [^\n]*\bsalt$/m.test(text)} paper=${text.includes("paper towels")}`, !/^- [^\n]*\d \w+ salt$/m.test(text.replace(/seasoned salt/g, "")) && !/^- .*(flour|olive oil)/m.test(text) && /^Probably have: .*olive oil/m.test(text) && text.includes("paper towels"));
// 7. Cook link
await q("document.querySelector('.plan-item__cook').click()"); await sleep(1500);
check(`cook link -> ${await q("location.pathname")} cook open ${await q("document.querySelector('.cook')?.open")}`, await q("document.querySelector('.cook').open"));
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/plan/");
check("desktop fits", await q("document.documentElement.scrollWidth <= innerWidth"));
await q("document.querySelector('.pantry').open = true"); await sleep(100);
await shot("plan2-desktop");
await q("document.querySelector('.pantry').scrollIntoView()"); await sleep(100);
await shot("plan2-pantry");
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
