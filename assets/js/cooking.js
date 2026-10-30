// What you're cooking: the recipes you've started (an ingredient or step
// ticked, saved by recipe.js), so you can find your way back to them. They show
// in three places:
//
//   - The header: "Cooking" next to Plan. Tap it for a menu of each recipe,
//     its step, and its timer, with Done to clear it. (Countdowns themselves
//     live in the timer tray at the bottom, not here as well.)
//   - "Pick up where you left off" at the top of the home and Recipes pages
//     ([data-resume]).
//   - Recipe cards: "Step 3 of 8".
//
// A recipe counts as started for 12 hours once a step is done, but only for 2
// with just ingredients ticked, so a stray tap doesn't follow you around (the
// same rule as recipe.js). Every step done means it's finished. Timers stay in
// their own tray at the bottom (timers.js), where an alarm can't be missed.
//
// On a phone the header has room only for a pot icon, so the first time it
// shows on another page, a note under it says what it's for, until you tap
// Got it or the pot (remembered in this browser).
//
// This script runs once per visit (like timers.js); the header and the page
// are new on every page, so it fills them in again on each.
(() => {
  const { store } = HawkinsPage;
  const Timers = window.HawkinsTimers;
  const PREFIX = "hawkins:recipe:";
  const HOUR = 60 * 60 * 1000;
  const UNDO_MS = 5000;
  const HINT_KEY = "hawkins:cooking-hint";
  const narrow = matchMedia("(max-width: 40rem)");

  const pathOf = (url) => new URL(url, location.href).pathname;
  const progressLabel = (r) => (r.steps.length ? `Step ${r.next} of ${r.total}` : "Getting ingredients");

  // Recipes with progress, most recently touched first.
  const inProgress = () => {
    const found = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PREFIX)) continue;
        const p = store.get(key);
        if (!p || !p.url || !p.title) continue;
        const steps = Array.isArray(p.steps) ? p.steps : [];
        const ingredients = Array.isArray(p.ingredients) ? p.ingredients : [];
        if (!steps.length && !ingredients.length) continue;
        if (!(Date.now() - p.at < (steps.length ? 12 : 2) * HOUR)) continue;
        if (p.total && steps.length >= p.total) continue;
        let next = 0;
        while (steps.includes(next)) next += 1;
        found.push({ key, slug: key.slice(PREFIX.length), title: p.title, url: p.url, image: p.image, at: p.at, total: p.total, steps, next: next + 1 });
      }
    } catch (_) { /* storage blocked */ }
    return found.sort((a, b) => b.at - a.at);
  };

  // A recipe's timer: the next one to go off, or one that already has.
  const timerFor = (r) => {
    if (!Timers) return null;
    const mine = Timers.list().filter((t) => pathOf(t.url) === pathOf(r.url)).sort((a, b) => a.end - b.end);
    return mine.find((t) => t.end <= Date.now()) || mine[0] || null;
  };
  const timerText = (t) => (t.end <= Date.now() ? "Timer done" : `⏱︎ ${Timers.formatClock((t.end - Date.now()) / 1000)}`);
  const metaText = (r) => {
    const t = timerFor(r);
    return t ? `${progressLabel(r)} · ${timerText(t)}` : progressLabel(r);
  };

  // ---------- A recipe's row (the header menu and Pick up where you left off) ----------
  const FORK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7v3h3"/></svg>';
  const buildRow = (r) => {
    const li = document.createElement("li");
    li.className = "cooking-row";
    li.dataset.slug = r.slug;
    li.innerHTML =
      '<a class="cooking-row__open"><span class="cooking-row__art"></span>' +
      '<span class="cooking-row__text"><span class="cooking-row__title"></span><span class="cooking-row__meta"></span></span></a>' +
      '<button class="cooking-row__done" type="button">Done</button>';
    li.querySelector("a").href = r.url;
    const art = li.querySelector(".cooking-row__art");
    if (r.image) {
      const img = document.createElement("img");
      img.src = r.image;
      img.alt = "";
      img.decoding = "async";
      art.append(img);
    } else {
      art.innerHTML = FORK;
    }
    li.querySelector(".cooking-row__title").textContent = r.title;
    li.querySelector(".cooking-row__meta").textContent = metaText(r);
    li.querySelector(".cooking-row__done").setAttribute("aria-label", `Done cooking ${r.title}: clear its progress`);
    return li;
  };

  // Done: clears the ticks (the servings you picked stay), with a moment to undo.
  const cleared = new Map(); // key -> { saved, timer }
  const done = (r) => {
    const saved = store.get(r.key);
    if (!saved) return;
    // On that recipe's own page, Start over clears what's on screen too.
    const here = pathOf(r.url) === location.pathname && document.querySelector("[data-reset]");
    if (here) here.click();
    else store.set(r.key, { ...saved, ingredients: [], steps: [], at: Date.now() });
    cleared.set(r.key, { saved, here: !!here, timer: setTimeout(() => { cleared.delete(r.key); render(); }, UNDO_MS) });
    render();
  };
  const undo = (key) => {
    const c = cleared.get(key);
    if (!c) return;
    clearTimeout(c.timer);
    cleared.delete(key);
    store.set(key, c.saved);
    // The recipe on screen has to read its ticks back in.
    if (c.here) HawkinsPage.visit(location.pathname + location.search);
    render();
  };
  const buildCleared = (key, title) => {
    const li = document.createElement("li");
    li.className = "cooking-row cooking-row--cleared";
    li.innerHTML = '<span class="cooking-row__note" role="status"></span><button class="cooking-row__undo" type="button">Undo</button>';
    li.querySelector(".cooking-row__note").textContent = `Cleared ${title}`;
    li.querySelector("button").addEventListener("click", () => undo(key));
    return li;
  };

  const fillList = (ul, list) => {
    const titles = new Map(list.map((r) => [r.key, r.title]));
    cleared.forEach((c, key) => titles.set(key, c.saved.title));
    const rows = list.map((r) => {
      const li = buildRow(r);
      li.querySelector(".cooking-row__done").addEventListener("click", () => done(r));
      return li;
    });
    // A cleared recipe keeps its place for a moment, with Undo.
    cleared.forEach((c, key) => rows.push(buildCleared(key, titles.get(key))));
    ul.replaceChildren(...rows);
  };

  // ---------- Render ----------
  let current = [];
  let tick = null;
  const render = () => {
    current = inProgress();
    const live = current.length > 0 || cleared.size > 0;

    // Header: "Cooking", with a count when there's more than one.
    const item = document.querySelector("[data-cooking]");
    if (item) {
      item.hidden = !live;
      fillList(document.querySelector("[data-cooking-menu] ul"), current);
      if (!live) setMenu(false);
      renderLabel();
    }

    // Pick up where you left off.
    document.querySelectorAll("[data-resume]").forEach((section) => {
      section.hidden = !live;
      fillList(section.querySelector("ul"), current);
    });

    // Cards say how far you've got.
    const bySlug = new Map(current.map((r) => [r.slug, r]));
    document.querySelectorAll(".card[data-slug]").forEach((card) => {
      const r = bySlug.get(card.dataset.slug);
      let note = card.querySelector(".card__progress");
      if (!r) { if (note) note.remove(); return; }
      if (!note) {
        note = document.createElement("p");
        note.className = "card__progress";
        card.querySelector(".card__title").after(note);
      }
      note.textContent = progressLabel(r);
    });

    renderHint();

    // Countdowns tick while a timer for one of them is running.
    const timing = Timers && current.some((r) => timerFor(r));
    if (timing && !tick) tick = setInterval(renderTimes, 1000);
    if (!timing && tick) { clearInterval(tick); tick = null; }
  };

  const renderLabel = () => {
    const item = document.querySelector("[data-cooking]");
    if (!item) return;
    const count = item.querySelector("[data-cooking-count]");
    count.hidden = current.length < 2;
    count.textContent = current.length;
    const names = current.map((r) => r.title).join(", ");
    item.querySelector("[data-cooking-toggle]").setAttribute("aria-label",
      `Cooking: ${names || "nothing"}. Show what you're cooking.`);
  };

  const renderTimes = () => {
    renderLabel();
    const bySlug = new Map(current.map((r) => [r.slug, r]));
    document.querySelectorAll(".cooking-row[data-slug]").forEach((li) => {
      const r = bySlug.get(li.dataset.slug);
      if (r) li.querySelector(".cooking-row__meta").textContent = metaText(r);
    });
  };

  // ---------- Teaching the pot (phones, once) ----------
  const renderHint = () => {
    const item = document.querySelector("[data-cooking]");
    let hint = document.querySelector("[data-cooking-hint]");
    // Most useful away from the recipe: that's when you'd lose your place.
    const elsewhere = current.find((r) => pathOf(r.url) !== location.pathname);
    if (!(item && !item.hidden && narrow.matches && elsewhere && !store.getText(HINT_KEY))) {
      if (hint) hint.remove();
      return;
    }
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "cooking-hint";
      hint.dataset.cookingHint = "";
      hint.setAttribute("role", "status");
      hint.innerHTML = '<p class="cooking-hint__text">Lost your place? Tap the pot to get back to <strong></strong>.</p>' +
        '<button class="cooking-hint__ok" type="button">Got it</button>';
      hint.querySelector("button").addEventListener("click", hintSeen);
      document.body.append(hint);
    }
    hint.querySelector("strong").textContent = elsewhere.title;
  };
  const hintSeen = () => {
    store.setText(HINT_KEY, "1");
    const hint = document.querySelector("[data-cooking-hint]");
    if (hint) hint.remove();
  };
  narrow.addEventListener("change", () => renderHint());

  // ---------- The header menu ----------
  const setMenu = (open) => {
    const item = document.querySelector("[data-cooking]");
    if (!item) return;
    document.querySelector("[data-cooking-menu]").hidden = !open;
    item.querySelector("[data-cooking-toggle]").setAttribute("aria-expanded", String(open));
  };
  document.addEventListener("click", (event) => {
    const item = document.querySelector("[data-cooking]");
    if (!item) return;
    // The path as tapped: Done redraws the menu before this runs.
    const path = event.composedPath();
    const menu = document.querySelector("[data-cooking-menu]");
    if (path.includes(item.querySelector("[data-cooking-toggle]"))) {
      hintSeen(); // found it
      setMenu(menu.hidden);
    } else if (!path.some((el) => el.matches && el.matches("[data-cooking-menu]")) || event.target.closest("a")) {
      setMenu(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const item = document.querySelector("[data-cooking]");
    if (!item || document.querySelector("[data-cooking-menu]").hidden) return;
    setMenu(false);
    item.querySelector("[data-cooking-toggle]").focus();
  });

  // ---------- When to render ----------
  document.addEventListener("turbo:load", render);
  document.addEventListener("hawkins:progress", render); // recipe.js saved
  addEventListener("storage", (event) => { if (!event.key || event.key.startsWith(PREFIX)) render(); });
  if (Timers) Timers.onChange(render);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
