// Meal plan: add recipes from anywhere on the site, then build one combined
// shopping list on /plan/. The plan is saved in this browser and can be shared
// as a link (/plan/?r=goulash,banana-bread:2).
(() => {
  const STORAGE_KEY = "hawkins:plan";
  const SCALES = [0.5, 1, 2, 3, 4];

  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.recipes)) {
        return {
          recipes: saved.recipes,
          checked: Array.isArray(saved.checked) ? saved.checked : [],
          extras: Array.isArray(saved.extras) ? saved.extras : [],
          hideChecked: Boolean(saved.hideChecked),
        };
      }
    } catch (_) { /* storage unavailable or corrupt */ }
    return { recipes: [], checked: [], extras: [], hideChecked: false };
  };

  let plan = load();
  let renderPage = () => {};

  // Staples you always have. Kept apart from the plan so it carries over
  // from one week's plan to the next. Starts with the usual suspects.
  const PANTRY_KEY = "hawkins:pantry";
  const PANTRY_START = ["Spices & Seasonings|salt", "Spices & Seasonings|black pepper",
    "Oils, Vinegar & Sauces|olive oil", "Baking|flour", "Baking|sugar"];
  const loadPantry = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(PANTRY_KEY));
      if (Array.isArray(saved)) return new Set(saved);
    } catch (_) { /* storage unavailable or corrupt */ }
    return new Set(PANTRY_START);
  };
  let pantry = loadPantry();
  const savePantry = () => {
    try { localStorage.setItem(PANTRY_KEY, JSON.stringify([...pantry])); } catch (_) { /* ignore */ }
    refresh();
  };

  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); } catch (_) { /* ignore */ }
    refresh();
  };

  const inPlan = (slug) => plan.recipes.some((r) => r.slug === slug);

  const togglePlan = (slug) => {
    if (inPlan(slug)) plan.recipes = plan.recipes.filter((r) => r.slug !== slug);
    else plan.recipes.push({ slug, scale: 1 });
    save();
  };

  // ---------- Header count and "+ Plan" buttons (every page) ----------
  const badge = document.querySelector("[data-plan-count]");
  const addButtons = [...document.querySelectorAll("[data-plan-add]")];
  let lastCount = null;

  const refresh = () => {
    const count = plan.recipes.length;
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
      if (lastCount !== null && count !== lastCount) {
        badge.classList.remove("is-bumped");
        void badge.offsetWidth; // restart the animation
        badge.classList.add("is-bumped");
      }
      badge.parentElement.setAttribute("aria-label", count ? `Meal plan, ${count} recipe${count === 1 ? "" : "s"}` : "Meal plan");
    }
    lastCount = count;

    addButtons.forEach((button) => {
      const added = inPlan(button.dataset.planAdd);
      const short = button.classList.contains("card__plan");
      button.textContent = added ? (short ? "✓ Planned" : "✓ In meal plan") : (short ? "+ Plan" : "+ Add to meal plan");
      button.setAttribute("aria-pressed", String(added));
      button.setAttribute("aria-label", added
        ? `Remove ${button.dataset.planTitle} from meal plan`
        : `Add ${button.dataset.planTitle} to meal plan`);
    });

    renderPage();
  };

  addButtons.forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePlan(button.dataset.planAdd);
    });
  });

  // Another tab changed the plan. Through HawkinsPage, so it's removed when
  // Turbo swaps in the next page (see page.js).
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) { plan = load(); refresh(); }
    if (event.key === PANTRY_KEY) { pantry = loadPantry(); refresh(); }
  };
  if (window.HawkinsPage) HawkinsPage.on(window, "storage", onStorage);
  else addEventListener("storage", onStorage);

  // ---------- Plan page ----------
  const page = document.querySelector("[data-plan-page]");
  const dataEl = document.getElementById("plan-data");
  if (!page || !dataEl) { refresh(); return; }

  const recipes = JSON.parse(dataEl.textContent);
  const bySlug = new Map(recipes.map((r) => [r.slug, r]));
  const $ = (sel) => page.querySelector(sel);

  // Quantities: "2 cups", "1½ tablespoons", "2–3", "1 to 2 drops", "1 can (15 ounces)".
  const FRACTION_CHARS = { "½": 1 / 2, "¼": 1 / 4, "¾": 3 / 4, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8 };
  const NUM = "(?:\\d+(?:\\.\\d+)?\\s*[½¼¾⅓⅔⅛⅜⅝⅞]?(?:\\s+\\d+/\\d+)?|\\d+/\\d+|[½¼¾⅓⅔⅛⅜⅝⅞])";
  const QTY_RE = new RegExp(`^(${NUM})(?:\\s*(?:–|-|to)\\s*(${NUM}))?\\s*(.*)$`, "i");

  const toNumber = (text) => {
    let s = text.trim();
    let n = 0;
    const glyph = s.match(/[½¼¾⅓⅔⅛⅜⅝⅞]$/);
    if (glyph) { n += FRACTION_CHARS[glyph[0]]; s = s.slice(0, -1).trim(); }
    const slash = s.match(/(\d+)\/(\d+)$/);
    if (slash) { n += Number(slash[1]) / Number(slash[2]); s = s.slice(0, slash.index).trim(); }
    if (s) n += parseFloat(s);
    return n;
  };

  // Volume units add up across teaspoons, tablespoons, and cups, and weights
  // across ounces and pounds. Each is stored in its smallest unit.
  const VOLUME = { tsp: 1, tbsp: 3, cup: 48 };
  const WEIGHT = { oz: 1, lb: 16 };
  const KNOWN_UNITS = [
    [/^(teaspoons?|tsp\.?)(?=\s|$)/i, "tsp"],
    [/^(tablespoons?|tbsp\.?|T)(?=\s|$)/, "tbsp"],
    [/^cups?(?=\s|$)/i, "cup"],
    [/^(pounds?|lbs?\.?)(?=\s|$)/i, "lb"],
    [/^(ounces?|oz\.?)(?=\s|$)/i, "oz"],
  ];
  const UNIT_NAMES = {
    tsp: ["teaspoon", "teaspoons"],
    tbsp: ["tablespoon", "tablespoons"],
    cup: ["cup", "cups"],
    lb: ["pound", "pounds"],
    oz: ["ounce", "ounces"],
  };
  const SIZE_WORDS = /^(large|medium|small|whole)$/i;

  const singular = (word) => {
    if (/(ch|sh|x)es$/i.test(word)) return word.slice(0, -2);
    if (/[^s]s$/i.test(word) && word.length > 3) return word.slice(0, -1);
    return word;
  };
  const plural = (word) => {
    if (/(ch|sh|x)$/i.test(word)) return `${word}es`;
    if (/loaf$/i.test(word)) return word.replace(/f$/i, "ves");
    if (/s$/i.test(word)) return word;
    return `${word}s`;
  };
  // Pluralize the last word before any "(15 ounces)" note: "small can" -> "small cans".
  const pluralUnit = (unit) => unit.replace(/^([^(]*?)(\S+)(\s*\(.*\))?$/, (_, before, last, note = "") =>
    `${before}${SIZE_WORDS.test(last) ? last : plural(last)}${note}`);

  const parseQty = (qty) => {
    const match = qty.trim().match(QTY_RE);
    if (!match) return null;
    const lo = toNumber(match[1]);
    const hi = match[2] ? toNumber(match[2]) : lo;
    // Drop metric conversions like "(250 mL)"; they'd be wrong once scaled.
    let rest = match[3].replace(/\s*\(\s*\d[\d.,]*\s*m?l\s*\)/i, "").replace(/\s+each\)/i, ")").trim();
    if (/\bper\b/i.test(rest)) return null; // "½ can per can of consommé" doesn't add up
    for (const [re, unit] of KNOWN_UNITS) {
      if (re.test(rest)) return { lo, hi, unit, label: unit };
    }
    if (SIZE_WORDS.test(rest)) rest = ""; // "1 large" egg counts as 1 egg
    const label = rest.replace(/^([^(]*?)(\S+)(\s*\(.*\))?$/, (_, before, last, note = "") => `${before}${singular(last)}${note}`);
    return { lo, hi, unit: label.toLowerCase(), label };
  };

  const FRACTIONS = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
    [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];
  const nearest = (n) => {
    const whole = Math.floor(n);
    const [value, glyph] = FRACTIONS.reduce((best, f) =>
      (Math.abs(n - whole - f[0]) < Math.abs(n - whole - best[0]) ? f : best));
    return value === 1 ? { whole: whole + 1, value: 0, glyph: "" } : { whole, value, glyph };
  };
  const formatNumber = (n) => {
    const { whole, glyph } = nearest(n);
    if (!whole && !glyph) return "⅛";
    return `${whole || ""}${glyph}`;
  };
  const formatRange = (lo, hi) => (formatNumber(lo) === formatNumber(hi) ? formatNumber(lo) : `${formatNumber(lo)}–${formatNumber(hi)}`);

  // Item names: "garlic, minced (1 tablespoon)" -> "garlic". A list of
  // ingredients ("salt, pepper, and dried basil, to taste") keeps its list
  // and loses only the prep notes.
  const PREP_NOTE = /^(as (needed|desired)|more\b|to (taste|serve)|for\b|mixed|shredded|plus\b|about\b|depending\b|peeled|washed|halved|cut|finely|thinly|very|lightly|chopped|diced|sliced|minced|melted|softened|thawed|drained|divided|seeded|beaten|grated|zested|undrained|room|casings|juice|filling|crushed|broken|pounded|cubed|packed|tempered|optional|mashed)/i;
  const cleanName = (item) => {
    let name = item.replace(/^skinless, boneless /i, "boneless skinless ");
    name = name.replace(/(?!^)\s*\([^)]*\)/g, ""); // keep a leading "(26-ounce)"
    const parts = name.split(/,\s*/);
    const end = parts.findIndex((part, i) => i > 0 && PREP_NOTE.test(part.replace(/^(and|or) /i, "")));
    return parts.slice(0, end === -1 ? parts.length : end).join(", ").replace(/\s+/g, " ").trim();
  };

  const PREP_WORDS = /^(chopped|diced|sliced|minced|finely|thinly|fresh|freshly|grated|shredded|packed|firmly|softened|melted|crushed|halved|uncooked|dry|good-quality|extra virgin|large|small|medium|lean|plain)\s+/;
  const SAME_AS = {
    "white sugar": "sugar", "granulated sugar": "sugar", "all-purpose flour": "flour",
    "vanilla extract": "vanilla", "ground black pepper": "black pepper", "pepper": "black pepper",
    "light brown sugar": "brown sugar", "powdered sugar": "confectioners' sugar",
    "heavy whipping cream": "heavy cream", "parmigiano-reggiano": "parmesan cheese",
    "mozzarella": "mozzarella cheese", "ground cinnamon": "cinnamon",
  };
  const mergeKey = (name) => {
    let key = name.toLowerCase();
    while (PREP_WORDS.test(key)) key = key.replace(PREP_WORDS, "");
    key = SAME_AS[key] || key;
    return key.replace(/(\S+)$/, (w) => singular(w));
  };

  // Store sections, checked in order; the first match wins.
  const AISLES = [
    ["skip", /^(boiling |hot |cold |ice )?water$/],
    ["Frozen", /\bfrozen\b|whipped topping|puff pastry/],
    ["Drinks & Alcohol", /\bwine\b|sherry|marsala|crème de|creme de|liqueur|vodka|\brum\b|beer/],
    ["Baking", /jell-o|gelatin|pudding|cake mix|muffin mix/],
    ["Spices & Seasonings", /\bsalt\b|black pepper|^pepper$|cayenne|paprika|cumin|cinnamon|ground (cloves|ginger|coriander)|oregano|thyme|marjoram|dried basil|italian seasoning|chili powder|garlic powder|onion powder|celery seed|bay lea|red pepper flakes|seasoning|ranch|^accent|sesame seeds|dried minced onion/],
    ["Oils, Vinegar & Sauces", /\boil\b|vinegar|soy sauce|tamari|hoisin|worcestershire|mustard|mayonnaise|chili sauce|cooking spray/],
    ["Canned & Jarred", /broth|stock|consommé|bouillon|\bsoup\b|\bbeans?\b|tomato (sauce|paste)|(crushed|diced|whole|petite) tomatoes|tomatoes &|green chilies|pasta sauce|spaghetti sauce|cream-style corn|whole kernel corn|mandarin|pineapple|jelly|preserves|pepperoncini/],
    ["Meat & Seafood", /beef|steak|chuck|pork|lamb|chicken|sausage|bacon|lobster|crab|shrimp|turkey|\bham\b|meatballs?/],
    ["Dairy & Refrigerated", /butter|margarine|milk|cream|cheese|cheddar|mozzarella|parmesan|parmigiano|romano|ricotta|feta|provolone|velveeta|neufchâtel|yogurt|\beggs?\b|crescent|cookie dough|tortellini|pie crust|pie pastry|wonton/],
    ["Produce", /apple|banana|basil|berr|broccoli|carrot|cauliflower|celery|cilantro|cucumber|dill|garlic|ginger|grape|onion|jalapeño|kale|chard|kiwi|lemon|lime|mint|mushroom|parsley|pepper|potato|rosemary|spinach|squash|zucchini|tomato|watermelon|avocado|coleslaw|lettuce|orange/],
    ["Snacks", /chips|crackers|ritz|oreo|waffle cone/],
    ["Pasta, Rice & Grains", /pasta|ziti|ditalini|macaroni|lasagna|noodle|\brice\b|panko|breadcrumbs|oats/],
    ["Baking", /flour|sugar|baking|cornstarch|cocoa|chocolate|vanilla|extract|shortening|marshmallow|food coloring|molasses|honey|almond|sprinkles/],
    ["Bread & Bakery", /bread|croutons|toast|\brolls?\b|\bbuns?\b|loaf/],
  ];
  const AISLE_ORDER = ["Produce", "Meat & Seafood", "Dairy & Refrigerated", "Bread & Bakery", "Pasta, Rice & Grains",
    "Canned & Jarred", "Oils, Vinegar & Sauces", "Spices & Seasonings", "Baking", "Snacks", "Frozen", "Drinks & Alcohol", "Other"];

  const aisleFor = (name, unit) => {
    const lower = name.toLowerCase().split(",")[0]; // "bread, cooked egg noodles, or potatoes" is bread
    if (/crescent|cookie dough|biscuit/.test(lower)) return "Dairy & Refrigerated";
    if (/\b(can|jar)\b/.test(unit) && !/water/.test(lower)) return "Canned & Jarred";
    const hit = AISLES.find(([, re]) => re.test(lower));
    return hit ? hit[0] : "Other";
  };

  // Combine every planned recipe's ingredients into one list.
  const buildList = () => {
    const rows = new Map();
    plan.recipes.forEach(({ slug, scale }) => {
      const recipe = bySlug.get(slug);
      if (!recipe) return;
      // A recipe can name what to buy with `shop:` (one name or a list) and
      // its aisle with `shop_aisle:`. Otherwise the name comes from the item
      // text. With a list, the amount goes with the first name.
      const lines = [];
      recipe.ingredients.forEach(([qty, item, shop, shopAisle]) => {
        const names = shop ? [].concat(shop) : [cleanName(item)];
        names.forEach((name, i) => lines.push([i ? "" : qty, String(name), shopAisle]));
      });
      lines.forEach(([qty, name, shopAisle]) => {
        const amount = qty ? parseQty(qty) : null;
        const aisle = shopAisle || aisleFor(name, amount ? amount.unit : qty.toLowerCase());
        if (aisle === "skip") return;
        const key = `${aisle}|${mergeKey(name)}`;
        let row = rows.get(key);
        if (!row) {
          row = { key, aisle, names: [], amounts: new Map(), asWritten: [], recipes: new Map() };
          rows.set(key, row);
        }
        if (!row.names.includes(name)) row.names.push(name);
        row.recipes.set(recipe.title, recipe.url);
        if (amount) {
          const factor = VOLUME[amount.unit] || WEIGHT[amount.unit] || 1;
          const unitKey = VOLUME[amount.unit] ? "volume" : WEIGHT[amount.unit] ? "weight" : amount.unit;
          const slot = row.amounts.get(unitKey) || { lo: 0, hi: 0, label: amount.label, units: new Set() };
          slot.lo += amount.lo * scale * factor;
          slot.hi += amount.hi * scale * factor;
          slot.units.add(amount.unit);
          row.amounts.set(unitKey, slot);
        } else if (qty) {
          row.asWritten.push(scale === 1 ? qty : `${qty} (×${formatNumber(scale)})`);
        }
      });
    });
    plan.extras.forEach((extra) => {
      const words = extra.text.replace(QTY_RE, (m, a, b, rest) => rest).replace(/^(cups?|tablespoons?|teaspoons?|pounds?|ounces?|cans?|jars?|bags?|boxes?)\s+(of\s+)?/i, "");
      const aisle = aisleFor(words || extra.text, "");
      rows.set(`extra|${extra.id}`, {
        key: `extra|${extra.id}`, aisle: aisle === "skip" ? "Other" : aisle, extra, names: [extra.text], recipes: new Map(),
      });
    });
    return [...rows.values()];
  };

  // Pick the biggest unit that gives a friendly number: 8 teaspoons reads
  // better as 2⅔ tablespoons, 4 tablespoons as ¼ cup, 20 ounces as 1¼ pounds.
  // A unit the recipes already used is always fine, so 13⅝ cups of flour
  // never turns into tablespoons.
  const FRIENDLY = {
    cup: [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4],
    tbsp: [0, 1 / 3, 1 / 2, 2 / 3],
    lb: [0, 1 / 4, 1 / 2, 3 / 4],
    tsp: FRACTIONS.map((f) => f[0]),
    oz: FRACTIONS.map((f) => f[0]),
  };
  const fits = (n) => {
    const { whole, value } = nearest(n);
    return Math.abs(whole + value - n) / n < 0.02;
  };
  const bestUnit = (slot, table, order) => {
    const used = slot.units;
    for (const [unit, min] of order) {
      if (slot.hi < min * table[unit]) continue;
      const lo = slot.lo / table[unit];
      const hi = slot.hi / table[unit];
      const friendly = [lo, hi].every((n) => fits(n) && FRIENDLY[unit].includes(nearest(n).value));
      if (used.has(unit) || friendly) return unit;
    }
    return order[order.length - 1][0];
  };
  const measure = (slot, table, order) => {
    const unit = bestUnit(slot, table, order);
    const lo = slot.lo / table[unit];
    const hi = slot.hi / table[unit];
    return `${formatRange(lo, hi)} ${UNIT_NAMES[unit][hi > 1 ? 1 : 0]}`;
  };

  const describe = (row) => {
    if (row.extra) return { amount: "", name: row.extra.text };
    const parts = [];
    let unitlessTotal = 0;
    for (const [unitKey, slot] of row.amounts) {
      if (unitKey === "volume") {
        parts.push(measure(slot, VOLUME, [["cup", 0.25], ["tbsp", 1], ["tsp", 0]]));
      } else if (unitKey === "weight") {
        parts.push(measure(slot, WEIGHT, [["lb", 1], ["oz", 0]]));
      } else if (!unitKey) {
        unitlessTotal = slot.hi;
        parts.push(formatRange(slot.lo, slot.hi));
      } else {
        parts.push(`${formatRange(slot.lo, slot.hi)} ${slot.hi > 1 ? pluralUnit(slot.label) : slot.label}`);
      }
    }
    parts.push(...row.asWritten);

    // "2 onion" reads wrong; prefer a plural name the recipes already use, or add an s.
    let name = row.names.reduce((a, b) => (b.length < a.length ? b : a)); // "sugar" over "white sugar"
    if (unitlessTotal > 1 && row.amounts.size === 1 && !/^\(|\b(jars?|cans?|packages?|box(es)?|bags?)\b/i.test(name)) {
      const pluralName = row.names.find((n) => /s$/i.test(n));
      name = pluralName || name.replace(/(\S+)$/, (w) => (/[sy]$/i.test(w) ? w : plural(w)));
    }
    return { amount: parts.join(" + "), name };
  };

  // ---------- Rendering ----------
  const ui = {
    shared: page.querySelector("[data-plan-shared]"),
    main: $("[data-plan-ui]"),
    list: $("[data-plan-list]"),
    empty: $("[data-plan-empty]"),
    recipeCount: $("[data-plan-recipe-count]"),
    select: $("[data-plan-select]"),
    actions: $("[data-plan-actions]"),
    aisles: $("[data-plan-aisles]"),
    listTools: $("[data-plan-list-tools]"),
    itemCount: $("[data-plan-item-count]"),
    uncheck: $("[data-plan-uncheck]"),
    hideChecked: $("[data-plan-hide-checked]"),
    extraForm: $("[data-plan-extra-form]"),
    extraInput: $("[data-plan-extra-input]"),
    pantry: $("[data-plan-pantry]"),
    pantryCount: $("[data-plan-pantry-count]"),
    pantryList: $("[data-plan-pantry-list]"),
    pantrySummary: $("[data-plan-pantry-summary]"),
    pantrySummaryText: $("[data-plan-pantry-summary-text]"),
    toast: $("[data-plan-toast]"),
    toastText: $("[data-plan-toast-text]"),
    toastAction: $("[data-plan-toast-action]"),
  };

  // A short message at the bottom of the screen, with an optional Undo.
  let toastTimer = null;
  let toastUndo = null;
  const toast = (message, undo) => {
    ui.toastText.textContent = message;
    toastUndo = undo || null;
    ui.toastAction.hidden = !undo;
    ui.toast.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.classList.remove("is-shown"); toastUndo = null; }, undo ? 6000 : 2500);
  };
  ui.toastAction.addEventListener("click", () => {
    if (toastUndo) toastUndo();
    toastUndo = null;
    ui.toast.classList.remove("is-shown");
  });

  // Undo puts back exactly what was there before.
  const snapshot = () => JSON.parse(JSON.stringify(plan));
  const restore = (saved) => () => { plan = saved; save(); };

  const scaleLabel = (scale) => `${formatNumber(scale)}×`;
  let currentRows = [];

  const renderRecipes = () => {
    ui.list.replaceChildren(...plan.recipes.filter((r) => bySlug.has(r.slug)).map(({ slug, scale }) => {
      const recipe = bySlug.get(slug);
      const li = document.createElement("li");
      li.className = "plan-item";
      li.innerHTML = `
        <div class="plan-item__main">
          <a class="plan-item__title"></a>
          <span class="plan-item__meta"><span data-serves></span><a class="plan-item__cook">Cook</a></span>
        </div>
        <div class="stepper" role="group">
          <button type="button" data-step="-1">−</button>
          <span class="stepper__value" aria-live="polite"></span>
          <button type="button" data-step="1">+</button>
        </div>
        <button class="plan-item__remove" type="button">&times;</button>`;
      const link = li.querySelector(".plan-item__title");
      link.href = recipe.url;
      link.textContent = recipe.title;
      const cook = li.querySelector(".plan-item__cook");
      cook.href = `${recipe.url}#cook`;
      cook.setAttribute("aria-label", `Cook ${recipe.title}`);
      li.querySelector("[data-serves]").textContent = recipe.servings ? `Serves ${formatNumber(recipe.servings * scale)}` : "";
      li.querySelector(".stepper").setAttribute("aria-label", `Batches of ${recipe.title}`);
      li.querySelector(".stepper__value").textContent = scaleLabel(scale);
      const [less, more] = li.querySelectorAll("[data-step]");
      less.setAttribute("aria-label", `Smaller batch of ${recipe.title}`);
      more.setAttribute("aria-label", `Bigger batch of ${recipe.title}`);
      less.disabled = scale <= SCALES[0];
      more.disabled = scale >= SCALES[SCALES.length - 1];
      li.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => {
        const entry = plan.recipes.find((r) => r.slug === slug);
        const i = SCALES.indexOf(entry.scale);
        entry.scale = SCALES[Math.max(0, Math.min(SCALES.length - 1, (i === -1 ? 1 : i) + Number(button.dataset.step)))];
        save();
      }));
      const remove = li.querySelector(".plan-item__remove");
      remove.setAttribute("aria-label", `Remove ${recipe.title}`);
      remove.addEventListener("click", () => {
        const before = snapshot();
        plan.recipes = plan.recipes.filter((r) => r.slug !== slug);
        save();
        toast(`Removed ${recipe.title}`, restore(before));
      });
      return li;
    }));

    const count = ui.list.children.length;
    ui.recipeCount.textContent = count ? `${count} recipe${count === 1 ? "" : "s"}` : "";
    ui.empty.hidden = count > 0;
    ui.actions.hidden = count === 0 && plan.extras.length === 0;
    [...ui.select.options].forEach((option) => { if (option.value) option.disabled = inPlan(option.value); });
  };

  // One line of the shopping list, with its button on the right:
  // "Pantry" for recipe items, "Need it" in the pantry, × for your own items.
  const renderRow = ({ row, amount, name }, checked, inPantry) => {
    const li = document.createElement("li");
    li.className = "shopping__row";
    li.innerHTML = `
      <label class="check">
        <input type="checkbox">
        <span class="check__box" aria-hidden="true"></span>
        <span class="check__text"><span class="qty"></span> <span class="shopping__name"></span></span>
      </label>
      <button class="shopping__action" type="button"></button>
      <span class="shopping__from"></span>`;
    const box = li.querySelector("input");
    box.checked = checked.has(row.key);
    box.addEventListener("change", () => {
      plan.checked = box.checked ? [...new Set([...plan.checked, row.key])] : plan.checked.filter((k) => k !== row.key);
      save();
    });
    const qty = li.querySelector(".qty");
    qty.textContent = amount;
    qty.hidden = !amount;
    li.querySelector(".shopping__name").textContent = name;

    // Each recipe name links to that recipe's ingredient list.
    const from = li.querySelector(".shopping__from");
    if (row.extra) {
      from.textContent = "Added by you";
    } else {
      [...row.recipes].forEach(([title, url], i) => {
        if (i) from.append(" · ");
        const a = document.createElement("a");
        a.href = `${url}#ingredients-title`;
        a.textContent = title;
        from.append(a);
      });
    }

    const action = li.querySelector(".shopping__action");
    if (row.extra) {
      action.innerHTML = "&times;";
      action.classList.add("shopping__action--remove");
      action.setAttribute("aria-label", `Remove ${name}`);
      action.addEventListener("click", () => {
        const before = snapshot();
        plan.extras = plan.extras.filter((x) => x.id !== row.extra.id);
        save();
        toast(`Removed ${name}`, restore(before));
      });
    } else if (inPantry) {
      action.textContent = "Need it";
      action.setAttribute("aria-label", `Need ${name}: put it back on the list`);
      action.addEventListener("click", () => {
        pantry.delete(row.key);
        savePantry();
        toast(`${name} is back on the list`, () => { pantry.add(row.key); savePantry(); });
      });
    } else {
      action.textContent = "Pantry";
      action.title = "Always have this. Moves it to Probably have, for every plan.";
      action.setAttribute("aria-label", `Always have ${name}: move it to the pantry`);
      action.addEventListener("click", () => {
        pantry.add(row.key);
        savePantry();
        toast(`Moved ${name} to Probably have`, () => { pantry.delete(row.key); savePantry(); });
      });
    }
    return li;
  };

  // "salt, olive oil (¼ cup)": the amount shows so you can tell if you have enough.
  const pantryNames = (entries) => [...entries].sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, amount }) => (amount ? `${name} (${amount})` : name)).join(", ");

  const renderList = () => {
    currentRows = buildList();
    const checked = new Set(plan.checked);
    const described = currentRows.map((row) => ({ row, ...describe(row) }));
    const toBuy = described.filter(({ row }) => !pantry.has(row.key));
    const stocked = described.filter(({ row }) => pantry.has(row.key));
    const byName = (a, b) => a.name.localeCompare(b.name);
    // Checked items sink to the bottom of their aisle, or hide.
    const byChecked = (a, b) => checked.has(a.row.key) - checked.has(b.row.key) || byName(a, b);

    const groups = AISLE_ORDER.map((aisle) => [aisle, toBuy
      .filter(({ row }) => row.aisle === aisle && !(plan.hideChecked && checked.has(row.key)))
      .sort(byChecked)])
      .filter(([, rows]) => rows.length);

    ui.aisles.replaceChildren(...groups.map(([aisle, rows]) => {
      const section = document.createElement("section");
      section.className = "aisle";
      const heading = document.createElement("h3");
      heading.className = "ingredients__group";
      heading.textContent = aisle;
      const list = document.createElement("ul");
      list.className = "checklist";
      list.append(...rows.map((entry) => renderRow(entry, checked, false)));
      section.append(heading, list);
      return section;
    }));

    ui.pantry.hidden = stocked.length === 0;
    ui.pantrySummary.hidden = stocked.length === 0;
    ui.pantrySummaryText.textContent =
      `Skipping ${stocked.length} you probably have: ${pantryNames(stocked)}.`;
    ui.pantryCount.textContent = stocked.length;
    ui.pantryList.replaceChildren(...stocked.sort(byName).map((entry) => renderRow(entry, checked, true)));

    const done = toBuy.filter(({ row }) => checked.has(row.key)).length;
    const hidden = plan.hideChecked && done ? " (hidden)" : "";
    ui.itemCount.textContent = toBuy.length ? `${toBuy.length} items${done ? ` · ${done} checked${hidden}` : ""}` : "";
    ui.listTools.hidden = described.length === 0;
    ui.uncheck.hidden = done === 0;
    ui.hideChecked.setAttribute("aria-pressed", String(plan.hideChecked));
  };

  renderPage = () => {
    // Forget checks for items that are no longer on the list.
    const keys = new Set(buildList().map((r) => r.key));
    plan.checked = plan.checked.filter((k) => keys.has(k));
    renderRecipes();
    renderList();
  };

  // ---------- Controls ----------
  ui.select.addEventListener("change", () => {
    const slug = ui.select.value;
    ui.select.value = "";
    if (!slug || inPlan(slug)) return;
    plan.recipes.push({ slug, scale: 1 });
    save();
    toast(`Added ${bySlug.get(slug).title}`);
  });

  ui.extraForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = ui.extraInput.value.replace(/\s+/g, " ").trim();
    if (!text) return;
    plan.extras.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text });
    ui.extraInput.value = "";
    save();
  });

  $("[data-plan-clear]").addEventListener("click", () => {
    const before = snapshot();
    plan = { recipes: [], checked: [], extras: [], hideChecked: plan.hideChecked };
    save();
    toast("Plan cleared", restore(before));
  });

  ui.uncheck.addEventListener("click", () => {
    const before = snapshot();
    plan.checked = [];
    save();
    toast("Unchecked everything", restore(before));
  });

  $("[data-plan-pantry-review]").addEventListener("click", () => {
    ui.pantry.open = true;
    ui.pantry.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    ui.pantry.querySelector("summary").focus({ preventScroll: true });
  });

  ui.hideChecked.addEventListener("click", () => {
    plan.hideChecked = !plan.hideChecked;
    save();
  });

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) { /* ignore */ }
      area.remove();
      return ok;
    }
  };

  // ?r=goulash,banana-bread:2 for recipes, &x=paper towels|milk for your own items.
  const shareUrl = () => {
    const params = new URLSearchParams();
    const r = plan.recipes.filter((x) => bySlug.has(x.slug))
      .map(({ slug, scale }) => (scale === 1 ? slug : `${slug}:${scale}`)).join(",");
    if (r) params.set("r", r);
    if (plan.extras.length) params.set("x", plan.extras.map((x) => x.text.replace(/\|/g, "/")).join("|"));
    return `${location.origin}${location.pathname}?${params.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")}`;
  };

  $("[data-plan-share]").addEventListener("click", async () => {
    const url = shareUrl();
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: "Meal plan", url }); return; } catch (_) { /* cancelled */ return; }
    }
    toast(await copyText(url) ? "Link copied" : "Couldn't copy the link");
  });

  $("[data-plan-copy]").addEventListener("click", async () => {
    const checked = new Set(plan.checked);
    const titles = plan.recipes.filter((r) => bySlug.has(r.slug))
      .map(({ slug, scale }) => `${bySlug.get(slug).title}${scale === 1 ? "" : ` (${scaleLabel(scale)})`}`);
    const lines = [titles.length ? `Shopping list for ${titles.join(", ")}` : "Shopping list"];
    AISLE_ORDER.forEach((aisle) => {
      const rows = currentRows.filter((r) => r.aisle === aisle && !checked.has(r.key) && !pantry.has(r.key))
        .map((row) => describe(row)).sort((a, b) => a.name.localeCompare(b.name));
      if (!rows.length) return;
      lines.push("", aisle.toUpperCase(), ...rows.map(({ amount, name }) => `- ${amount ? `${amount} ` : ""}${name}`));
    });
    const stocked = currentRows.filter((r) => pantry.has(r.key)).map((row) => describe(row));
    if (stocked.length) lines.push("", `Probably have: ${pantryNames(stocked)}`);
    toast(await copyText(lines.join("\n")) ? "Shopping list copied" : "Couldn't copy the list");
  });

  $("[data-plan-print]").addEventListener("click", () => print());

  // ---------- Shared links ----------
  const parseShared = (value) => (value || "").split(",").filter(Boolean).map((part) => {
    const [slug, scale] = part.split(":");
    const n = Number(scale);
    return { slug, scale: SCALES.includes(n) ? n : 1 };
  }).filter((r, i, all) => bySlug.has(r.slug) && all.findIndex((x) => x.slug === r.slug) === i);
  const parseExtras = (value) => (value || "").split("|").map((t) => t.trim()).filter(Boolean)
    .map((text, i) => ({ id: `s${i}${Date.now().toString(36)}`, text }));

  const params = new URLSearchParams(location.search);
  const dropParam = () => history.replaceState(history.state, "", location.pathname); // keeps Turbo's entry data
  if (params.has("r") || params.has("x")) {
    const shared = parseShared(params.get("r"));
    const extras = parseExtras(params.get("x"));
    const sameRecipes = shared.length === plan.recipes.length &&
      shared.every((x) => plan.recipes.some((y) => y.slug === x.slug && y.scale === x.scale));
    const sameExtras = extras.length === plan.extras.length && extras.every((x, i) => x.text === plan.extras[i].text);
    const use = () => {
      plan = { recipes: shared, checked: [], extras, hideChecked: plan.hideChecked };
      save();
    };
    if ((!shared.length && !extras.length) || (sameRecipes && sameExtras)) {
      dropParam();
    } else if (!plan.recipes.length && !plan.extras.length) {
      use();
      dropParam();
    } else {
      ui.shared.hidden = false;
      const names = [...shared.map((r) => bySlug.get(r.slug).title), ...(extras.length ? [`${extras.length} extra item${extras.length === 1 ? "" : "s"}`] : [])];
      ui.shared.querySelector("[data-plan-shared-summary]").textContent = `(${names.join(", ")}).`;
      ui.shared.querySelector("[data-plan-shared-use]").addEventListener("click", () => {
        const before = snapshot();
        use();
        ui.shared.hidden = true;
        dropParam();
        toast("Loaded the shared plan", restore(before));
      });
      ui.shared.querySelector("[data-plan-shared-keep]").addEventListener("click", () => {
        ui.shared.hidden = true;
        dropParam();
      });
    }
  }

  ui.main.hidden = false;
  refresh();
})();
