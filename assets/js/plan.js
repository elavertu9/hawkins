// Meal plan: add recipes from anywhere on the site, then build one combined
// shopping list on /plan/. The plan is saved in this browser and can be shared
// as a link (/plan/?r=goulash,banana-bread:2).
//
// Classified recipes can join the plan only while this device has the
// clearance code (HawkinsPage.clearance): their + Plan buttons stay hidden
// until then, and the plan page decrypts their ingredients to list them.
// Lock takes them back out of the plan.
(async () => {
  const STORAGE_KEY = "hawkins:plan";
  const { SCALES, QTY_RE, FRACTIONS, nearest, split, singular, plural, formatNumber, formatRange } = HawkinsQty;

  const { store } = HawkinsPage;
  const load = () => {
    const saved = store.get(STORAGE_KEY);
    if (saved && Array.isArray(saved.recipes)) {
      return {
        recipes: saved.recipes,
        checked: Array.isArray(saved.checked) ? saved.checked : [],
        extras: Array.isArray(saved.extras) ? saved.extras : [],
      };
    }
    return { recipes: [], checked: [], extras: [] };
  };

  let plan = load();
  let renderPage = () => {};

  // Staples you always have. Kept apart from the plan so it carries over
  // from one week's plan to the next. Starts with the usual suspects.
  const PANTRY_KEY = "hawkins:pantry";
  const PANTRY_START = ["Spices & Seasonings|salt", "Spices & Seasonings|black pepper",
    "Oils, Vinegar & Sauces|olive oil", "Baking|flour", "Baking|sugar"];
  const loadPantry = () => {
    const saved = store.get(PANTRY_KEY);
    return new Set(Array.isArray(saved) ? saved : PANTRY_START);
  };
  let pantry = loadPantry();
  const savePantry = () => {
    store.set(PANTRY_KEY, [...pantry]);
    refresh();
  };

  const save = () => {
    store.set(STORAGE_KEY, plan);
    refresh();
  };

  const inPlan = (slug) => plan.recipes.some((r) => r.slug === slug);

  // Planned classified recipes are marked, so Lock knows which to take out.
  const { clearance } = HawkinsPage;
  const classifiedSlugs = new Set();

  // A recipe joins the plan at the servings last picked on its page (recipe.js
  // saves them with your progress for 12 hours), or as written.
  const RECIPE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const pickedScale = (slug) => {
    const saved = store.get(`hawkins:recipe:${slug}`);
    return saved && Date.now() - saved.at < RECIPE_MAX_AGE_MS && SCALES.includes(saved.scale) ? saved.scale : 1;
  };
  const addToPlan = (slug) => plan.recipes.push({ slug, scale: pickedScale(slug), ...(classifiedSlugs.has(slug) && { classified: true }) });

  const togglePlan = (slug) => {
    if (inPlan(slug)) plan.recipes = plan.recipes.filter((r) => r.slug !== slug);
    else addToPlan(slug);
    save();
  };

  // ---------- Header count and "+ Plan" buttons (every page) ----------
  const badge = document.querySelector("[data-plan-count]");
  let addButtons = [];
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
      badge.parentElement.setAttribute("aria-label", count ? `Plan, ${count} planned` : "Plan");
    }
    lastCount = count;

    addButtons.forEach((button) => {
      const added = inPlan(button.dataset.planAdd);
      const short = button.classList.contains("card__plan");
      // "Plan", not "meal plan": drinks go in it too.
      button.textContent = added ? (short ? "✓ Planned" : "✓ In plan") : (short ? "+ Plan" : "+ Add to plan");
      button.setAttribute("aria-pressed", String(added));
      button.setAttribute("aria-label", added
        ? `Remove ${button.dataset.planTitle} from the plan`
        : `Add ${button.dataset.planTitle} to the plan`);
    });

    renderPage();
  };

  // A classified recipe's button stays hidden without the clearance code.
  const wireButtons = () => document.querySelectorAll("[data-plan-add]:not([data-plan-wired])").forEach((button) => {
    if ("planClassified" in button.dataset) {
      if (!clearance.code()) return;
      classifiedSlugs.add(button.dataset.planAdd);
    }
    button.dataset.planWired = "";
    button.hidden = false;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePlan(button.dataset.planAdd);
    });
    addButtons.push(button);
  });
  wireButtons();
  // A classified recipe page, just unlocked (classified.js).
  HawkinsPage.on(document, "hawkins:classified-open", () => { wireButtons(); refresh(); });
  HawkinsPage.on(document, "hawkins:locked", () => {
    plan = load(); // what's saved, in case this page's copy is behind
    plan.recipes = plan.recipes.filter((r) => !r.classified);
    save();
  });

  // Another tab changed the plan. Through HawkinsPage, so it's removed when
  // Turbo swaps in the next page (see page.js).
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) { plan = load(); refresh(); }
    if (event.key === PANTRY_KEY) { pantry = loadPantry(); refresh(); }
  };
  HawkinsPage.on(window, "storage", onStorage);

  // ---------- Plan page ----------
  const page = document.querySelector("[data-plan-page]");
  const dataEl = document.getElementById("plan-data");
  if (!page || !dataEl) { refresh(); return; }

  const recipes = JSON.parse(dataEl.textContent);
  // Classified recipes: listed by name only, their ingredients locked with the
  // clearance code (scripts/classified.rb). With the code, they join the rest.
  const classifiedEl = document.getElementById("plan-classified");
  if (classifiedEl && clearance.code()) {
    const { cipher, recipes: listed } = JSON.parse(classifiedEl.textContent);
    const opened = await clearance.open(cipher);
    if (!page.isConnected) return; // left the page while it decrypted
    if (opened === null) {
      clearance.forget(); // the code changed since this device saved it
    } else {
      const details = JSON.parse(opened);
      const select = page.querySelector("[data-plan-select]");
      listed.filter((r) => details[r.slug]).forEach((r) => {
        recipes.push({ ...r, ...details[r.slug] });
        classifiedSlugs.add(r.slug);
        // Into its course in the Add a recipe list, A–Z.
        let group = [...select.querySelectorAll("optgroup")].find((g) => g.label === r.category);
        if (!group) {
          group = document.createElement("optgroup");
          group.label = r.category;
          select.insertBefore(group, [...select.querySelectorAll("optgroup")].find((g) => g.label.localeCompare(r.category) > 0) || null);
        }
        const option = new Option(r.title, r.slug);
        group.insertBefore(option, [...group.children].find((o) => o.text.localeCompare(r.title) > 0) || null);
      });
    }
  }
  const bySlug = new Map(recipes.map((r) => [r.slug, r]));
  const $ = (sel) => page.querySelector(sel);

  // Volume units add up across teaspoons, tablespoons, and cups, and weights
  // across ounces and pounds. Each is stored in its smallest unit. A drink's
  // "oz" is fluid ounces (floz), a volume, so bourbon never adds up to pounds.
  const VOLUME = { tsp: 1, tbsp: 3, floz: 6, cup: 48 };
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
    floz: ["oz", "oz"],
  };
  const SIZE_WORDS = /^(large|medium|small|whole)$/i;

  // Pluralize the last word before any "(15 ounces)" note: "small can" -> "small cans".
  const pluralUnit = (unit) => unit.replace(/^([^(]*?)(\S+)(\s*\(.*\))?$/, (_, before, last, note = "") =>
    `${before}${SIZE_WORDS.test(last) ? last : plural(last)}${note}`);

  const parseQty = (qty, drink = false) => {
    const parts = split(qty);
    if (!parts) return null;
    const { lo, hi } = parts;
    // Drop metric conversions like "(250 mL)"; they'd be wrong once scaled.
    let rest = parts.rest.replace(/\s*\(\s*\d[\d.,]*\s*m?l\s*\)/i, "").replace(/\s+each\)/i, ")").trim();
    if (/\bper\b/i.test(rest)) return null; // "½ can per can of consommé" doesn't add up
    for (const [re, unit] of KNOWN_UNITS) {
      if (re.test(rest)) return drink && unit === "oz" ? { lo, hi, unit: "floz", label: "floz" } : { lo, hi, unit, label: unit };
    }
    if (SIZE_WORDS.test(rest)) rest = ""; // "1 large" egg counts as 1 egg
    const label = rest.replace(/^([^(]*?)(\S+)(\s*\(.*\))?$/, (_, before, last, note = "") => `${before}${singular(last)}${note}`);
    return { lo, hi, unit: label.toLowerCase(), label };
  };

  // Item names: "garlic, minced (1 tablespoon)" -> "garlic". A list of
  // ingredients ("salt, pepper, and dried basil, to taste") keeps its list
  // and loses only the prep notes.
  const PREP_NOTE = /^(such as\b|as (needed|desired)|more\b|to (taste|serve)|for\b|mixed|shredded|plus\b|about\b|depending\b|peeled|washed|halved|cut|finely|thinly|very|lightly|chopped|diced|sliced|minced|melted|softened|thawed|drained|divided|seeded|beaten|grated|zested|undrained|room|casings|juice|filling|crushed|broken|pounded|cubed|packed|tempered|optional|mashed)/i;
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
    ["Drinks & Alcohol", /\bwine\b|sherry|marsala|crème de|creme de|liqueur|vodka|\brum\b|beer|bourbon|whiske?y|tequila|bitters|grenadine|jim beam|red stag|lemon-lime soda|club soda|tonic water|ginger ale/],
    ["Baking", /jell-o|gelatin|pudding|cake mix|muffin mix/],
    ["Spices & Seasonings", /\bsalt\b|black pepper|^pepper$|cayenne|paprika|cumin|cinnamon|ground (cloves|ginger|coriander)|oregano|thyme|marjoram|dried basil|italian seasoning|chili powder|garlic powder|onion powder|celery seed|bay lea|red pepper flakes|seasoning|ranch|^accent|sesame seeds|dried minced onion/],
    ["Oils, Vinegar & Sauces", /\boil\b|vinegar|soy sauce|tamari|hoisin|worcestershire|mustard|mayonnaise|ketchup|horseradish|chili sauce|cooking spray/],
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
  const buildList = (planned = plan.recipes) => {
    const rows = new Map();
    planned.forEach(({ slug, scale }) => {
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
        const amount = qty ? parseQty(qty, recipe.drink) : null;
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
      const words = extra.text.replace(QTY_RE, (m, a, joiner, b, rest) => rest).replace(/^(cups?|tablespoons?|teaspoons?|pounds?|ounces?|cans?|jars?|bags?|boxes?)\s+(of\s+)?/i, "");
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
    floz: FRACTIONS.map((f) => f[0]),
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
        // Only drinks: in ounces, the way a bar measures. With a recipe's cups, the usual units.
        const order = [...slot.units].every((u) => u === "floz") ? [["floz", 0]] : [["cup", 0.25], ["tbsp", 1], ["tsp", 0]];
        parts.push(measure(slot, VOLUME, order));
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
      name = pluralName || name.replace(/(\S+)$/, (w) => (/[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : /[sy]$/i.test(w) ? w : plural(w))); // cherry -> cherries
    }
    return { amount: parts.join(" + "), name };
  };

  // ---------- Rendering ----------
  const ui = {
    shared: page.querySelector("[data-plan-shared]"),
    main: $("[data-plan-ui]"),
    list: $("[data-plan-list]"),
    drinks: $("[data-plan-drinks]"),
    drinksTitle: $("[data-plan-drinks-title]"),
    empty: $("[data-plan-empty]"),
    recipeCount: $("[data-plan-recipe-count]"),
    select: $("[data-plan-select]"),
    summary: $("[data-plan-summary]"),
    summaryCount: $("[data-plan-summary-count]"),
    summaryNames: $("[data-plan-summary-names]"),
    summaryDone: $("[data-plan-summary-done]"),
    recipesBody: $("[data-plan-recipes-body]"),
    faves: $("[data-plan-faves]"),
    favesList: $("[data-plan-faves-list]"),
    aisles: $("[data-plan-aisles]"),
    listTools: $("[data-plan-list-tools]"),
    itemCount: $("[data-plan-item-count]"),
    uncheck: $("[data-plan-uncheck]"),
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

  // How much of each recipe, as servings like the recipe page ("Serves 8"),
  // or as a multiple for a recipe that doesn't say how many it serves.
  const servingsOf = (recipe, scale) => {
    const base = recipe.servings ? split(String(recipe.servings)) : null;
    return base ? formatRange(base.lo * scale, base.hi * scale) : null;
  };
  const amountLabel = (recipe, scale) => {
    if (recipe.drink) return `${formatNumber(scale)} drink${scale === 1 ? "" : "s"}`;
    const serves = servingsOf(recipe, scale);
    return serves ? `serves ${serves}` : `${formatNumber(scale)}×`;
  };
  // A drink is made whole: 1 to 4 of them, never half.
  const scalesFor = (recipe) => (recipe.drink ? SCALES.filter((n) => n >= 1) : SCALES);
  // "2 recipes", "1 drink", or "2 recipes, 1 drink".
  const plannedCount = (entries) => {
    const drinks = entries.filter((r) => bySlug.get(r.slug).drink).length;
    const dishes = entries.length - drinks;
    return [dishes && `${dishes} recipe${dishes === 1 ? "" : "s"}`, drinks && `${drinks} drink${drinks === 1 ? "" : "s"}`].filter(Boolean).join(", ");
  };
  let currentRows = [];

  // On a phone, a plan you come back to opens with its recipes folded into
  // one line, so the shopping list is right there in the store; Edit opens
  // them. Starting from an empty plan, they stay open while you add (no
  // folding under your finger) until you tap Done.
  const narrow = matchMedia("(max-width: 55.99rem)");
  let editing = !plan.recipes.some((r) => bySlug.has(r.slug));
  const renderFold = () => {
    const count = plan.recipes.filter((r) => bySlug.has(r.slug)).length;
    const folded = narrow.matches && count > 0 && !editing;
    ui.summary.hidden = !folded;
    ui.summary.setAttribute("aria-expanded", String(!folded));
    ui.recipesBody.hidden = folded;
    ui.summaryDone.hidden = !(narrow.matches && count > 0 && editing);
    ui.summaryCount.textContent = `${plannedCount(plan.recipes.filter((r) => bySlug.has(r.slug)))}:`;
    ui.summaryNames.textContent = plan.recipes.filter((r) => bySlug.has(r.slug)).map((r) => bySlug.get(r.slug).title).join(", ");
  };
  ui.summary.addEventListener("click", () => { editing = true; renderFold(); ui.recipesBody.querySelector("h2").scrollIntoView({ block: "nearest" }); });
  ui.summaryDone.addEventListener("click", () => { editing = false; renderFold(); ui.summary.focus(); });
  narrow.addEventListener("change", renderFold);
  HawkinsPage.onLeave(() => narrow.removeEventListener("change", renderFold));

  const renderRecipes = () => {
    const planned = plan.recipes.filter((r) => bySlug.has(r.slug));
    const item = ({ slug, scale }) => {
      const recipe = bySlug.get(slug);
      const scales = scalesFor(recipe);
      const li = document.createElement("li");
      li.className = "plan-item";
      li.innerHTML = `
        <div class="plan-item__main">
          <a class="plan-item__title"></a>
          <span class="plan-item__meta"><a class="plan-item__cook">Cook</a></span>
        </div>
        <div class="plan-item__amount">
          <span class="plan-item__serves" aria-hidden="true"></span>
          <div class="stepper" role="group">
            <button type="button" data-step="-1">−</button>
            <span class="stepper__value" aria-live="polite"></span>
            <button type="button" data-step="1">+</button>
          </div>
        </div>
        <button class="plan-item__remove" type="button">&times;</button>`;
      const link = li.querySelector(".plan-item__title");
      link.href = recipe.url;
      link.textContent = recipe.title;
      // A drink has no cook mode: its link opens the drink, and it makes some number of drinks.
      const cook = li.querySelector(".plan-item__cook");
      cook.href = recipe.drink ? recipe.url : `${recipe.url}#cook`;
      cook.textContent = recipe.drink ? "Make" : "Cook";
      cook.setAttribute("aria-label", `${recipe.drink ? "Make" : "Cook"} ${recipe.title}`);
      const serves = servingsOf(recipe, scale);
      li.querySelector(".plan-item__serves").textContent = recipe.drink ? "Makes" : serves ? "Serves" : "";
      li.querySelector(".stepper").setAttribute("aria-label", `${recipe.title}: ${amountLabel(recipe, scale)}`);
      li.querySelector(".stepper__value").textContent = recipe.drink ? formatNumber(scale) : serves || `${formatNumber(scale)}×`;
      const [less, more] = li.querySelectorAll("[data-step]");
      less.setAttribute("aria-label", `Less ${recipe.title}`);
      more.setAttribute("aria-label", `More ${recipe.title}`);
      less.disabled = scale <= scales[0];
      more.disabled = scale >= scales[scales.length - 1];
      li.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => {
        const entry = plan.recipes.find((r) => r.slug === slug);
        const i = scales.indexOf(entry.scale);
        entry.scale = scales[Math.max(0, Math.min(scales.length - 1, (i === -1 ? scales.indexOf(1) : i) + Number(button.dataset.step)))];
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
    };
    // Recipes, then drinks under their own heading.
    ui.list.replaceChildren(...planned.filter((r) => !bySlug.get(r.slug).drink).map(item));
    ui.drinks.replaceChildren(...planned.filter((r) => bySlug.get(r.slug).drink).map(item));
    ui.drinksTitle.hidden = ui.drinks.children.length === 0;

    const count = planned.length;
    ui.recipeCount.textContent = count ? plannedCount(planned) : "";
    ui.empty.hidden = count > 0;
    [...ui.select.options].forEach((option) => { if (option.value) option.disabled = inPlan(option.value); });

    // Favorites (hearted on a recipe page) not in the plan yet: one tap adds.
    const faves = HawkinsPage.favorites.list().filter((slug) => bySlug.has(slug) && !inPlan(slug));
    ui.faves.hidden = faves.length === 0;
    ui.favesList.replaceChildren(...faves.map((slug) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = `+ ${bySlug.get(slug).title}`;
      button.setAttribute("aria-label", `Add ${bySlug.get(slug).title}`);
      button.addEventListener("click", () => {
        addToPlan(slug);
        save();
        toast(`Added ${bySlug.get(slug).title}`);
      });
      return button;
    }));
    renderFold();
  };

  // One line of the shopping list, with its button on the right:
  // "Have at home" for recipe items, "Need it" under At home, × for your own items.
  // where: "list" (an aisle; a ticked row strikes through and stays put, buttons
  // and all) or "pantry" (At home: nothing to tick, just Need it).
  const renderRow = ({ row, amount, name }, checked, where) => {
    const li = document.createElement("li");
    li.className = "shopping__row";
    const text = `<span class="check__text"><span class="qty"></span> <span class="shopping__name"></span></span>`;
    li.innerHTML = where === "pantry" ? `
      <p class="shopping__item">${text}</p>
      <button class="shopping__action" type="button"></button>
      <span class="shopping__from"></span>` : `
      <label class="check">
        <input type="checkbox">
        <span class="check__box" aria-hidden="true"></span>
        ${text}
      </label>
      <button class="shopping__action" type="button"></button>
      <span class="shopping__from"></span>`;
    const box = li.querySelector("input");
    if (box) box.checked = checked.has(row.key);
    box?.addEventListener("change", () => {
      // A row never moves when you tap it: a ticked one strikes through in its aisle.
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
    } else if (where === "pantry") {
      action.textContent = "Need it";
      action.setAttribute("aria-label", `Need ${name}: put it back on the list`);
      action.addEventListener("click", () => {
        pantry.delete(row.key);
        savePantry();
        toast(`${name[0].toUpperCase()}${name.slice(1)} is back on the list`, () => { pantry.add(row.key); savePantry(); });
      });
    } else {
      action.textContent = "Have at home";
      action.title = "You have this at home: take it off every plan's list.";
      action.setAttribute("aria-label", `Have ${name} at home: take it off the list`);
      action.addEventListener("click", () => {
        pantry.add(row.key);
        savePantry();
        toast(`You have ${name} at home`, () => { pantry.delete(row.key); savePantry(); });
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
    // Checked items stay in their aisle, struck through; they only add to the count.
    const inCart = toBuy.filter(({ row }) => checked.has(row.key));

    const groups = AISLE_ORDER.map((aisle) => [aisle, toBuy
      .filter(({ row }) => row.aisle === aisle)
      .sort(byName)])
      .filter(([, rows]) => rows.length);

    ui.aisles.replaceChildren(...groups.map(([aisle, rows]) => {
      const section = document.createElement("section");
      section.className = "aisle";
      const heading = document.createElement("h3");
      heading.className = "ingredients__group";
      heading.textContent = aisle;
      const list = document.createElement("ul");
      list.className = "checklist";
      list.append(...rows.map((entry) => renderRow(entry, checked, "list")));
      section.append(heading, list);
      return section;
    }));

    ui.pantry.hidden = stocked.length === 0;
    ui.pantrySummary.hidden = stocked.length === 0;
    ui.pantrySummaryText.textContent =
      `Skipping ${stocked.length} you have at home: ${pantryNames(stocked)}.`;
    ui.pantryCount.textContent = stocked.length;
    ui.pantryList.replaceChildren(...stocked.sort(byName).map((entry) => renderRow(entry, checked, "pantry")));

    const left = toBuy.length - inCart.length;
    ui.itemCount.textContent = !toBuy.length ? "" : left ? `${left} to get${inCart.length ? ` · ${inCart.length} in the cart` : ""}` : "All in the cart";
    ui.listTools.hidden = described.length === 0;
    ui.uncheck.hidden = inCart.length === 0;
  };

  renderPage = () => {
    // Forget checks for items that are no longer on the list.
    const keys = new Set(buildList().map((r) => r.key));
    plan.checked = plan.checked.filter((k) => keys.has(k));
    renderRecipes();
    renderList();
    // In the store: once something's in the cart, the screen stays on.
    HawkinsPage.wake.set("shopping", plan.checked.length > 0);
  };
  HawkinsPage.onLeave(() => HawkinsPage.wake.set("shopping", false));

  // ---------- Controls ----------
  ui.select.addEventListener("change", () => {
    const slug = ui.select.value;
    ui.select.value = "";
    if (!slug || inPlan(slug)) return;
    addToPlan(slug);
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

  // The Share and … menus. Each opens toward whichever side has room, so on
  // a phone it never runs off the screen.
  const menus = [...page.querySelectorAll(".menu")].map((el) => ({
    el,
    toggle: el.querySelector("[data-plan-menu-toggle]"),
    list: el.querySelector("[data-plan-menu]"),
  }));
  const showMenu = (menu, open) => {
    menus.forEach((m) => {
      const on = m === menu && open;
      m.list.hidden = !on;
      m.toggle.setAttribute("aria-expanded", String(on));
    });
    if (!menu || !open) return;
    menu.list.classList.remove("is-start");
    if (menu.list.getBoundingClientRect().left < 8) menu.list.classList.add("is-start");
    menu.list.querySelector("button:not([hidden])").focus();
  };
  menus.forEach((menu) => {
    menu.toggle.addEventListener("click", () => showMenu(menu, menu.list.hidden));
    menu.list.addEventListener("click", (event) => { if (event.target.closest("button")) showMenu(menu, false); });
    menu.list.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { showMenu(menu, false); menu.toggle.focus(); }
    });
  });
  HawkinsPage.on(document, "pointerdown", (event) => {
    if (!event.target.closest(".menu")) showMenu(null, false);
  });

  $("[data-plan-clear]").addEventListener("click", () => {
    const before = snapshot();
    plan = { recipes: [], checked: [], extras: [] };
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
  // Sharing leaves classified recipes out: the person on the other end may not
  // have the code. shared() is what goes out.
  const shared = () => plan.recipes.filter((r) => bySlug.has(r.slug) && !classifiedSlugs.has(r.slug));
  const shareUrl = () => {
    const params = new URLSearchParams();
    const r = shared()
      .map(({ slug, scale }) => (scale === 1 ? slug : `${slug}:${scale}`)).join(",");
    if (r) params.set("r", r);
    if (plan.extras.length) params.set("x", plan.extras.map((x) => x.text.replace(/\|/g, "/")).join("|"));
    return `${location.origin}${location.pathname}?${params.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")}`;
  };

  // The list as text, for Share: what's left to get, by aisle, then what
  // you have at home.
  const listText = () => {
    const checked = new Set(plan.checked);
    const recipes = shared();
    const rows = recipes.length === plan.recipes.filter((r) => bySlug.has(r.slug)).length ? currentRows : buildList(recipes);
    const titles = recipes
      .map(({ slug, scale }) => `${bySlug.get(slug).title}${scale === 1 ? "" : ` (${amountLabel(bySlug.get(slug), scale)})`}`);
    const lines = [titles.length ? `Shopping list for ${titles.join(", ")}` : "Shopping list"];
    AISLE_ORDER.forEach((aisle) => {
      const inAisle = rows.filter((r) => r.aisle === aisle && !checked.has(r.key) && !pantry.has(r.key))
        .map((row) => describe(row)).sort((a, b) => a.name.localeCompare(b.name));
      if (!inAisle.length) return;
      lines.push("", aisle.toUpperCase(), ...inAisle.map(({ amount, name }) => `- ${amount ? `${amount} ` : ""}${name}`));
    });
    const stocked = rows.filter((r) => pantry.has(r.key)).map((row) => describe(row));
    if (stocked.length) lines.push("", `Have at home: ${pantryNames(stocked)}`);
    return lines.join("\n");
  };

  // Share the shopping list (with a link to the plan), or just the link, so
  // someone can open the plan on their own phone. On a phone through its
  // share sheet (Messages, Notes...), elsewhere by copying.
  const share = async (what) => {
    const url = shareUrl();
    const text = what === "list" ? listText() : "";
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share(text ? { title: "Shopping list", text, url } : { title: "Meal plan", url }); } catch (_) { /* cancelled */ }
      return;
    }
    const copied = await copyText(text ? `${text}\n\nThe plan: ${url}` : url);
    toast(!copied ? "Couldn't copy that" : text ? "Shopping list and plan link copied" : "Plan link copied");
  };
  // With classified recipes in the plan, say they stay behind first, and
  // share from the dialog's own button (sharing needs a fresh tap).
  const held = {
    dialog: $("[data-plan-held-dialog]"),
    title: $("[data-plan-held-title]"),
    text: $("[data-plan-held-text]"),
    cancel: $("[data-plan-held-cancel]"),
    share: $("[data-plan-held-share]"),
    what: null,
  };
  const listNames = (names) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  const askFirst = (what) => {
    const names = plan.recipes.filter((r) => bySlug.has(r.slug) && classifiedSlugs.has(r.slug)).map((r) => bySlug.get(r.slug).title);
    if (!names.length) return share(what);
    const rest = shared().length > 0 || plan.extras.length > 0;
    held.what = what;
    held.title.textContent = rest ? `${listNames(names)} won't be shared` : "Classified recipes can't be shared";
    held.text.textContent = rest ? "Classified recipes stay on your device. Everything else goes." : "Classified recipes stay on your device. Add something else to share a plan.";
    held.cancel.textContent = rest ? "Cancel" : "OK";
    held.share.hidden = !rest;
    held.dialog.showModal();
  };
  held.cancel.addEventListener("click", () => held.dialog.close());
  held.share.addEventListener("click", () => {
    held.dialog.close();
    share(held.what);
  });
  // A tap outside the box is Cancel. (A tap on the box's own padding is inside.)
  held.dialog.addEventListener("click", (event) => {
    const r = held.dialog.getBoundingClientRect();
    const outside = event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
    if (event.target === held.dialog && outside) held.dialog.close();
  });
  HawkinsPage.onLeave(() => held.dialog.close()); // not left open for Back
  page.querySelectorAll("[data-plan-share]").forEach((button) => button.addEventListener("click", () => askFirst(button.dataset.planShare)));

  $("[data-plan-print]").addEventListener("click", () => print());

  // ---------- Shared links ----------
  const parseShared = (value) => (value || "").split(",").filter(Boolean).map((part) => {
    const [slug, scale] = part.split(":");
    const n = Number(scale);
    const drink = bySlug.get(slug)?.drink; // half a drink isn't a thing
    return { slug, scale: SCALES.includes(n) && !(drink && n < 1) ? n : 1, ...(classifiedSlugs.has(slug) && { classified: true }) };
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
      plan = { recipes: shared, checked: [], extras };
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
