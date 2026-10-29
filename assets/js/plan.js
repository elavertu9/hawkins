// Meal plan: add recipes from anywhere on the site, then build one combined
// shopping list on /plan/. The plan is saved in this browser and can be shared
// as a link (/plan/?r=goulash,banana-bread:2).
(() => {
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

  // A recipe joins the plan at the servings last picked on its page (recipe.js
  // saves them with your progress for 12 hours), or as written.
  const RECIPE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const pickedScale = (slug) => {
    const saved = store.get(`hawkins:recipe:${slug}`);
    return saved && Date.now() - saved.at < RECIPE_MAX_AGE_MS && SCALES.includes(saved.scale) ? saved.scale : 1;
  };
  const addToPlan = (slug) => plan.recipes.push({ slug, scale: pickedScale(slug) });

  const togglePlan = (slug) => {
    if (inPlan(slug)) plan.recipes = plan.recipes.filter((r) => r.slug !== slug);
    else addToPlan(slug);
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
  HawkinsPage.on(window, "storage", onStorage);

  // ---------- Plan page ----------
  const page = document.querySelector("[data-plan-page]");
  const dataEl = document.getElementById("plan-data");
  if (!page || !dataEl) { refresh(); return; }

  const recipes = JSON.parse(dataEl.textContent);
  const bySlug = new Map(recipes.map((r) => [r.slug, r]));
  const $ = (sel) => page.querySelector(sel);

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

  // Pluralize the last word before any "(15 ounces)" note: "small can" -> "small cans".
  const pluralUnit = (unit) => unit.replace(/^([^(]*?)(\S+)(\s*\(.*\))?$/, (_, before, last, note = "") =>
    `${before}${SIZE_WORDS.test(last) ? last : plural(last)}${note}`);

  const parseQty = (qty) => {
    const parts = split(qty);
    if (!parts) return null;
    const { lo, hi } = parts;
    // Drop metric conversions like "(250 mL)"; they'd be wrong once scaled.
    let rest = parts.rest.replace(/\s*\(\s*\d[\d.,]*\s*m?l\s*\)/i, "").replace(/\s+each\)/i, ")").trim();
    if (/\bper\b/i.test(rest)) return null; // "½ can per can of consommé" doesn't add up
    for (const [re, unit] of KNOWN_UNITS) {
      if (re.test(rest)) return { lo, hi, unit, label: unit };
    }
    if (SIZE_WORDS.test(rest)) rest = ""; // "1 large" egg counts as 1 egg
    const label = rest.replace(/^([^(]*?)(\S+)(\s*\(.*\))?$/, (_, before, last, note = "") => `${before}${singular(last)}${note}`);
    return { lo, hi, unit: label.toLowerCase(), label };
  };

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
    summary: $("[data-plan-summary]"),
    summaryCount: $("[data-plan-summary-count]"),
    summaryNames: $("[data-plan-summary-names]"),
    summaryDone: $("[data-plan-summary-done]"),
    recipesBody: $("[data-plan-recipes-body]"),
    faves: $("[data-plan-faves]"),
    favesList: $("[data-plan-faves-list]"),
    aisles: $("[data-plan-aisles]"),
    cart: $("[data-plan-cart]"),
    cartCount: $("[data-plan-cart-count]"),
    cartList: $("[data-plan-cart-list]"),
    listTools: $("[data-plan-list-tools]"),
    menu: $("[data-plan-menu]"),
    menuToggle: $("[data-plan-menu-toggle]"),
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
    const serves = servingsOf(recipe, scale);
    return serves ? `serves ${serves}` : `${formatNumber(scale)}×`;
  };
  let currentRows = [];

  // On a phone the recipes fold into one line once there are some, so the
  // shopping list is right there in the store. Edit opens them again.
  const narrow = matchMedia("(max-width: 55.99rem)");
  let editing = false;
  const renderFold = () => {
    const count = plan.recipes.filter((r) => bySlug.has(r.slug)).length;
    const folded = narrow.matches && count > 0 && !editing;
    ui.summary.hidden = !folded;
    ui.summary.setAttribute("aria-expanded", String(!folded));
    ui.recipesBody.hidden = folded;
    ui.summaryDone.hidden = !(narrow.matches && count > 0 && editing);
    ui.summaryCount.textContent = `${count} recipe${count === 1 ? "" : "s"}:`;
    ui.summaryNames.textContent = plan.recipes.filter((r) => bySlug.has(r.slug)).map((r) => bySlug.get(r.slug).title).join(", ");
  };
  ui.summary.addEventListener("click", () => { editing = true; renderFold(); ui.recipesBody.querySelector("h2").scrollIntoView({ block: "nearest" }); });
  ui.summaryDone.addEventListener("click", () => { editing = false; renderFold(); ui.summary.focus(); });
  narrow.addEventListener("change", renderFold);
  HawkinsPage.onLeave(() => narrow.removeEventListener("change", renderFold));

  const renderRecipes = () => {
    ui.list.replaceChildren(...plan.recipes.filter((r) => bySlug.has(r.slug)).map(({ slug, scale }) => {
      const recipe = bySlug.get(slug);
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
      const cook = li.querySelector(".plan-item__cook");
      cook.href = `${recipe.url}#cook`;
      cook.setAttribute("aria-label", `Cook ${recipe.title}`);
      const serves = servingsOf(recipe, scale);
      li.querySelector(".plan-item__serves").textContent = serves ? "Serves" : "";
      li.querySelector(".stepper").setAttribute("aria-label", `${recipe.title}: ${amountLabel(recipe, scale)}`);
      li.querySelector(".stepper__value").textContent = serves || `${formatNumber(scale)}×`;
      const [less, more] = li.querySelectorAll("[data-step]");
      less.setAttribute("aria-label", `Less ${recipe.title}`);
      more.setAttribute("aria-label", `More ${recipe.title}`);
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
      action.textContent = "Have it";
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
    // Checked items leave their aisle for "In the cart", so the list shrinks as you shop.
    const inCart = toBuy.filter(({ row }) => checked.has(row.key));

    const groups = AISLE_ORDER.map((aisle) => [aisle, toBuy
      .filter(({ row }) => row.aisle === aisle && !checked.has(row.key))
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
      list.append(...rows.map((entry) => renderRow(entry, checked, false)));
      section.append(heading, list);
      return section;
    }));

    ui.cart.hidden = inCart.length === 0;
    ui.cartCount.textContent = inCart.length;
    ui.cartList.replaceChildren(...inCart.sort(byName).map((entry) => renderRow(entry, checked, false)));

    ui.pantry.hidden = stocked.length === 0;
    ui.pantrySummary.hidden = stocked.length === 0;
    ui.pantrySummaryText.textContent =
      `Skipping ${stocked.length} you probably have: ${pantryNames(stocked)}.`;
    ui.pantryCount.textContent = stocked.length;
    ui.pantryList.replaceChildren(...stocked.sort(byName).map((entry) => renderRow(entry, checked, true)));

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

  // The … menu: Print, Uncheck all, Clear plan.
  const showMenu = (open) => {
    ui.menu.hidden = !open;
    ui.menuToggle.setAttribute("aria-expanded", String(open));
    if (open) ui.menu.querySelector("button:not([hidden])").focus();
  };
  ui.menuToggle.addEventListener("click", () => showMenu(ui.menu.hidden));
  ui.menu.addEventListener("click", (event) => { if (event.target.closest("button")) showMenu(false); });
  ui.menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { showMenu(false); ui.menuToggle.focus(); }
  });
  HawkinsPage.on(document, "pointerdown", (event) => {
    if (!ui.menu.hidden && !event.target.closest(".menu")) showMenu(false);
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
  const shareUrl = () => {
    const params = new URLSearchParams();
    const r = plan.recipes.filter((x) => bySlug.has(x.slug))
      .map(({ slug, scale }) => (scale === 1 ? slug : `${slug}:${scale}`)).join(",");
    if (r) params.set("r", r);
    if (plan.extras.length) params.set("x", plan.extras.map((x) => x.text.replace(/\|/g, "/")).join("|"));
    return `${location.origin}${location.pathname}?${params.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")}`;
  };

  // The list as text, for Share: what's left to get, by aisle, then what
  // you probably have.
  const listText = () => {
    const checked = new Set(plan.checked);
    const titles = plan.recipes.filter((r) => bySlug.has(r.slug))
      .map(({ slug, scale }) => `${bySlug.get(slug).title}${scale === 1 ? "" : ` (${amountLabel(bySlug.get(slug), scale)})`}`);
    const lines = [titles.length ? `Shopping list for ${titles.join(", ")}` : "Shopping list"];
    AISLE_ORDER.forEach((aisle) => {
      const rows = currentRows.filter((r) => r.aisle === aisle && !checked.has(r.key) && !pantry.has(r.key))
        .map((row) => describe(row)).sort((a, b) => a.name.localeCompare(b.name));
      if (!rows.length) return;
      lines.push("", aisle.toUpperCase(), ...rows.map(({ amount, name }) => `- ${amount ? `${amount} ` : ""}${name}`));
    });
    const stocked = currentRows.filter((r) => pantry.has(r.key)).map((row) => describe(row));
    if (stocked.length) lines.push("", `Probably have: ${pantryNames(stocked)}`);
    return lines.join("\n");
  };

  // Share sends the list and a link to the plan together: on a phone through
  // its share sheet (Messages, Notes...), elsewhere by copying both.
  $("[data-plan-share]").addEventListener("click", async () => {
    const text = listText();
    const url = shareUrl();
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: "Shopping list", text, url }); } catch (_) { /* cancelled */ }
      return;
    }
    toast(await copyText(`${text}\n\nThe plan: ${url}`) ? "Shopping list and plan link copied" : "Couldn't copy the list");
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
