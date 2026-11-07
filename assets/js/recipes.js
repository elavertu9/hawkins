// The recipes page (recipes/index.html): search and filters. Without
// JavaScript the tools stay hidden and every recipe shows, grouped by dish.
//
// One search box does it all: tapping it suggests dishes and tags, and
// picking one adds it to the box as a pill (tap the pill to remove it).
// Typing narrows the suggestions as well as the recipes. Filters work
// together: Dessert + Quick + Vegetarian shows recipes that are all three.
// Favorites (hearted on a recipe page) work the same way. They're kept in
// the URL (?q=...&category=...&tag=...&tag=...&favorites=1) so the back
// button returns to the same results. Sorting (?sort=az, newest, quickest)
// trades the dish groups for one list.
//
// Loaded once, in <head> (like page.js), so it's ready the moment Turbo swaps
// in /recipes/ and starts the finder before the page is seen: no flash of
// every recipe before the filters in the URL apply.
(() => {
  const init = () => {
    const finder = document.querySelector("[data-finder]");
    if (!finder || "started" in finder.dataset) return;
    finder.dataset.started = "";
    start(finder);
  };
  document.addEventListener("turbo:load", init);
  document.addEventListener("DOMContentLoaded", init); // in case Turbo isn't running

function start(finder) {
  const input = finder.querySelector("[data-search-input]");
  const search = finder.querySelector("[data-search]");
  const tokenList = finder.querySelector("[data-tokens]");
  const suggest = finder.querySelector("[data-suggest]");
  const dishChips = [...suggest.querySelectorAll(".chip[data-category]")];
  const tagChips = [...suggest.querySelectorAll(".chip[data-tag]")];
  const favChip = suggest.querySelector(".chip[data-fav]");
  const favorites = new Set(HawkinsPage.favorites.list());
  const status = finder.querySelector("[data-status]");
  const sortSelect = finder.querySelector("[data-sort]");
  const empty = document.querySelector("[data-empty]");
  const emptyText = empty.querySelector("[data-empty-text]");
  const browse = document.querySelector("[data-browse]");
  const groups = [...browse.querySelectorAll("[data-group]")];
  const flat = document.querySelector("[data-flat]");
  const cards = [...browse.querySelectorAll(".card")];

  // Lowercase and drop accents, so "jalapeno" finds "jalapeño".
  const fold = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const wordsOf = (text) => fold(text).split(/\s+/).filter(Boolean);
  cards.forEach((card) => { card.searchText = fold(card.dataset.search || ""); });
  const titleOf = (card) => card.querySelector(".card__title").textContent.trim();
  const byTitle = [...cards].sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const labelOf = (kind, slug) => (kind === "fav" ? favChip : (kind === "tag" ? tagChips : dishChips)
    .find((c) => (kind === "tag" ? c.dataset.tag : c.dataset.category) === slug)).dataset.label;

  const params = new URLSearchParams(location.search);
  input.value = params.get("q") || "";
  let category = params.get("category") || "";
  if (!dishChips.some((c) => c.dataset.category === category)) category = "";
  let tags = [...new Set(params.getAll("tag").flatMap((t) => t.split(",")))]
    .filter((t) => tagChips.some((c) => c.dataset.tag === t));
  let favOnly = params.get("favorites") === "1" && favorites.size > 0;
  let sort = params.get("sort") || "";
  if (![...sortSelect.options].some((o) => o.value === sort)) sort = "";
  sortSelect.value = sort;

  const hasTag = (card, slug) => (card.dataset.tags || "").split(" ").includes(slug);
  const inDish = (card, dish = category) => !dish || card.dataset.category === dish;
  const inTags = (card, list = tags) => list.every((t) => hasTag(card, t));
  const inFavs = (card, on = favOnly) => !on || favorites.has(card.dataset.slug);
  // Everything picked so far, apart from the search words.
  const picked = (card) => inDish(card) && inTags(card) && inFavs(card);

  // Ties keep A–Z order. Classified recipes have no time, so they go last on Quickest.
  const sorters = {
    az: () => 0,
    newest: (a, b) => (b.dataset.added || "").localeCompare(a.dataset.added || ""),
    quickest: (a, b) => (a.dataset.total ? +a.dataset.total : Infinity) - (b.dataset.total ? +b.dataset.total : Infinity),
  };
  const reorder = () => {
    const grouped = !sorters[sort];
    if (grouped) {
      const grids = Object.fromEntries(groups.map((g) => [g.dataset.group, g.querySelector(".card-grid")]));
      byTitle.forEach((card) => grids[card.dataset.category].append(card));
    } else {
      flat.append(...[...byTitle].sort((a, b) => sorters[sort](a, b) || byTitle.indexOf(a) - byTitle.indexOf(b)));
    }
    browse.hidden = !grouped;
    flat.hidden = grouped;
  };

  // Suggestions: what you could add next. Leaves out what's already picked,
  // what wouldn't match anything, and (once you type) what doesn't match the
  // words you typed.
  let open = false;
  const fitsTyped = (chip) => {
    const typed = wordsOf(input.value);
    if (!typed.length) return true;
    const label = wordsOf(chip.dataset.label);
    return typed.some((w) => label.some((l) => l.startsWith(w)));
  };
  const offered = () => [
    ...(!favOnly && cards.some((card) => picked(card) && inFavs(card, true)) ? [favChip] : []),
    ...dishChips.filter((c) => c.dataset.category !== category
      && cards.some((card) => inDish(card, c.dataset.category) && inTags(card) && inFavs(card))),
    ...tagChips.filter((c) => !tags.includes(c.dataset.tag)
      && cards.some((card) => picked(card) && hasTag(card, c.dataset.tag))),
  ].filter(fitsTyped);
  const renderSuggest = () => {
    const shown = new Set(open ? offered() : []);
    [favChip, ...dishChips, ...tagChips].forEach((chip) => { chip.hidden = !shown.has(chip); });
    suggest.querySelectorAll(".suggest__group").forEach((g) => { g.hidden = !g.querySelector(".chip:not([hidden])"); });
    suggest.hidden = shown.size === 0;
    input.setAttribute("aria-expanded", String(shown.size > 0));
  };
  const setOpen = (on) => { open = on; renderSuggest(); };

  const renderTokens = () => {
    const pills = [
      ...(favOnly ? [["fav", ""]] : []),
      ...(category ? [["category", category]] : []),
      ...tags.map((t) => ["tag", t]),
    ];
    tokenList.replaceChildren(...pills.map(([kind, slug]) => {
      const label = labelOf(kind, slug);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = { tag: "token token--tag", fav: "token token--fave" }[kind] || "token";
      button.dataset.kind = kind;
      button.dataset.value = slug;
      button.setAttribute("aria-label", `Remove ${label}`);
      const x = document.createElement("span");
      x.className = "token__x";
      x.setAttribute("aria-hidden", "true");
      x.textContent = "×";
      button.append(label, x);
      item.append(button);
      return item;
    }));
    tokenList.hidden = pills.length === 0;
    input.placeholder = pills.length ? "Search" : "Search or filter";
  };

  const update = () => {
    const words = wordsOf(input.value);
    let shown = 0;
    cards.forEach((card) => {
      card.hidden = !(words.every((w) => card.searchText.includes(w)) && picked(card));
      if (!card.hidden) shown++;
    });
    groups.forEach((group) => {
      const count = group.querySelectorAll(".card:not([hidden])").length;
      group.hidden = count === 0;
      group.querySelector("[data-group-count]").textContent = count;
    });

    const filtered = words.length || category || tags.length || favOnly;
    status.textContent = filtered ? `Showing ${shown} of ${cards.length} recipes` : `${cards.length} recipes`;
    empty.hidden = shown > 0;
    const asked = [
      ...(input.value.trim() ? [`“${input.value.trim()}”`] : []),
      ...(favOnly ? [labelOf("fav")] : []),
      ...(category ? [labelOf("category", category)] : []),
      ...tags.map((t) => labelOf("tag", t)),
    ];
    emptyText.textContent = asked.length > 1
      ? `No recipes match ${asked.join(" + ")}. Try removing one.`
      : "No recipes match that search.";

    renderTokens();
    renderSuggest();

    const next = new URLSearchParams();
    if (input.value.trim()) next.set("q", input.value.trim());
    if (category) next.set("category", category);
    tags.forEach((t) => next.append("tag", t));
    if (favOnly) next.set("favorites", "1");
    if (sort) next.set("sort", sort);
    const query = next.toString();
    history.replaceState(history.state, "", query ? `?${query}` : location.pathname); // keeps Turbo's entry data
  };

  // Picking a suggestion adds it as a pill, and drops the typed words that
  // found it: "chicken din" + Dinner leaves "chicken".
  const pick = (chip) => {
    if (chip.dataset.fav !== undefined) favOnly = true;
    else if (chip.dataset.tag !== undefined) tags.push(chip.dataset.tag);
    else category = chip.dataset.category;
    const label = wordsOf(chip.dataset.label);
    input.value = input.value.split(/\s+/).filter((w) => w && !label.some((l) => l.startsWith(fold(w)))).join(" ");
    update();
  };
  const remove = (kind, slug) => {
    if (kind === "tag") tags = tags.filter((t) => t !== slug);
    else if (kind === "fav") favOnly = false;
    else category = "";
    update();
  };

  suggest.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    pick(chip);
    // From the keyboard, stay in the search to keep going. On a phone, put
    // the keyboard away so the results show.
    if (event.detail === 0) input.focus();
    else { input.blur(); setOpen(false); }
  });
  tokenList.addEventListener("click", (event) => {
    const token = event.target.closest(".token");
    if (!token) return;
    remove(token.dataset.kind, token.dataset.value);
    if (event.detail === 0) input.focus();
  });
  // The whole box opens the search, not just the text part of it.
  search.addEventListener("click", (event) => {
    if (event.target.closest(".token")) return;
    input.focus();
    setOpen(true);
  });
  input.addEventListener("focus", () => setOpen(true));
  input.addEventListener("input", () => { open = true; update(); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (open && !suggest.hidden) setOpen(false);
      else if (input.value) { input.value = ""; update(); }
    } else if (event.key === "Backspace" && !input.value && !input.selectionStart && (favOnly || category || tags.length)) {
      // Backspace in an empty box removes the last pill, like a text field with tokens.
      if (tags.length) tags.pop(); else if (category) category = ""; else favOnly = false;
      update();
    } else if (event.key === "ArrowDown" && !suggest.hidden) {
      event.preventDefault();
      suggest.querySelector(".chip:not([hidden])").focus();
    } else if (event.key === "Enter") {
      // Enter takes the suggestion when only one is left, then shows the results.
      const left = offered();
      if (input.value.trim() && left.length === 1) pick(left[0]);
      input.blur();
      setOpen(false);
    }
  });
  // Close the suggestions when you tap or tab somewhere else. (Tapping a
  // suggestion doesn't focus it on iPhone, so this listens for the tap.)
  const inside = (node) => node && (search.contains(node) || suggest.contains(node));
  const closeOutside = (event) => { if (open && !inside(event.target)) setOpen(false); };
  finder.addEventListener("focusout", (event) => { if (event.relatedTarget && !inside(event.relatedTarget)) setOpen(false); });

  sortSelect.addEventListener("change", () => { sort = sortSelect.value; reorder(); update(); });
  empty.querySelector("[data-clear]").addEventListener("click", () => {
    input.value = "";
    category = "";
    tags = [];
    favOnly = false;
    update();
    input.focus();
  });

  // "Surprise me" goes to a random recipe from the ones showing, so it
  // respects the search and filter. It skips the last one it picked.
  const gate = document.querySelector("[data-random]");
  gate.addEventListener("click", () => {
    const showing = cards.filter((card) => !card.hidden);
    const pool = showing.length ? showing : cards;
    const last = HawkinsPage.session.getText("hawkins:last-random");
    const choices = pool.length > 1 ? pool.filter((c) => c.querySelector(".card__link").href !== last) : pool;
    const href = choices[Math.floor(Math.random() * choices.length)].querySelector(".card__link").href;
    HawkinsPage.session.setText("hawkins:last-random", href);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    gate.classList.add("is-opening");
    gate.textContent = "Opening…";
    setTimeout(() => { HawkinsPage.visit(href); }, still ? 0 : 450);
  });
  // Reset the button if the page comes back from the back/forward cache.
  const resetGate = () => {
    gate.classList.remove("is-opening");
    gate.textContent = "Surprise me";
  };
  HawkinsPage.on(window, "pageshow", resetGate);
  HawkinsPage.on(document, "pointerdown", closeOutside);

  finder.hidden = false;
  gate.hidden = false;
  reorder();
  update();
}
})();
