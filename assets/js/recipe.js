// Recipe page helpers: check off ingredients and steps, change the servings,
// favorite the recipe, and keep the screen awake while you cook. Cook mode is
// in cook.js, which builds on what this file shares as window.HawkinsRecipe.
// Progress is saved per recipe in this browser and forgotten after 12 hours,
// so a half-finished session from last week doesn't greet you next time.
(() => {
  window.HawkinsRecipe = null;
  const recipe = document.querySelector("[data-recipe-id]");
  if (!recipe) return;

  // Window and document listeners go through HawkinsPage so they're removed
  // when Turbo swaps in the next page (see page.js).
  const page = HawkinsPage;

  const STORAGE_KEY = `hawkins:recipe:${recipe.dataset.recipeId}`;
  const MAX_AGE_MS = 12 * 60 * 60 * 1000;

  const load = () => {
    const saved = page.store.get(STORAGE_KEY);
    if (saved && Date.now() - saved.at < MAX_AGE_MS) return saved;
    return { ingredients: [], steps: [] };
  };

  const state = load();

  const syncWake = () => page.wake.set("progress", state.ingredients.length > 0 || state.steps.length > 0);
  const save = () => {
    state.at = Date.now();
    page.store.set(STORAGE_KEY, state);
    resetButton.hidden = state.ingredients.length === 0 && state.steps.length === 0;
    syncWake();
  };

  const boxes = [...recipe.querySelectorAll(".ingredients .checklist input[type=checkbox]")];
  const mirrors = [...recipe.querySelectorAll("[data-mirror]")];
  const steps = [...recipe.querySelectorAll(".step")];
  const resetButton = recipe.querySelector("[data-reset]");

  // Ingredients. Cook mode has its own copy of the list; the two stay in sync.
  const syncMirrors = () => {
    mirrors.forEach((m) => { m.checked = state.ingredients.includes(m.dataset.mirror); });
  };
  boxes.forEach((box) => {
    box.checked = state.ingredients.includes(box.dataset.key);
    box.addEventListener("change", () => {
      state.ingredients = boxes.filter((b) => b.checked).map((b) => b.dataset.key);
      syncMirrors();
      save();
    });
  });
  mirrors.forEach((mirror) => {
    mirror.addEventListener("change", () => {
      const box = boxes.find((b) => b.dataset.key === mirror.dataset.mirror);
      box.checked = mirror.checked;
      box.dispatchEvent(new Event("change"));
    });
  });
  syncMirrors();

  // Steps
  const setStep = (step, done) => {
    step.classList.toggle("is-done", done);
    const button = step.querySelector(".step__num");
    button.setAttribute("aria-pressed", String(done));
  };
  // Cook mode listens for "hawkins:steps" to keep its button's label current.
  const saveSteps = () => {
    state.steps = steps.map((s, i) => (s.classList.contains("is-done") ? i : -1)).filter((i) => i >= 0);
    save();
    recipe.dispatchEvent(new Event("hawkins:steps"));
  };
  // Progress is how far you've got: steps before index are done, the rest not.
  const markUpTo = (index) => {
    steps.forEach((s, i) => setStep(s, i < index));
    saveSteps();
  };

  steps.forEach((step, index) => {
    setStep(step, state.steps.includes(index));

    // Tapping a step marks it and everything before it done; tapping a done
    // step takes you back to just before it. Same as moving around cook mode.
    const toggle = () => markUpTo(step.classList.contains("is-done") ? index : index + 1);

    step.querySelector(".step__num").addEventListener("click", toggle);
    step.querySelector(".step__body").addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      if (String(window.getSelection())) return; // let people select text
      toggle();
    });
  });

  resetButton.addEventListener("click", () => {
    boxes.forEach((b) => { b.checked = false; });
    steps.forEach((s) => setStep(s, false));
    state.ingredients = [];
    syncMirrors();
    saveSteps();
  });
  resetButton.hidden = state.ingredients.length === 0 && state.steps.length === 0;

  // Servings: the stepper scales every amount, here and in cook mode, by the
  // same multiples the meal plan uses (see qty.js). Amounts mentioned in the
  // steps stay as written, and a note says so.
  const servings = recipe.querySelector("[data-servings]");
  const base = servings && HawkinsQty.split(servings.dataset.servings);
  if (base) {
    const { SCALES, formatRange, scale } = HawkinsQty;
    const amounts = [...recipe.querySelectorAll(".qty")].map((el) => [el, el.textContent]);
    const value = servings.querySelector("[data-servings-value]");
    const stat = recipe.querySelector("[data-serves-stat]");
    const note = servings.querySelector("[data-servings-note]");
    const [less, more] = servings.querySelectorAll("[data-servings-step]");
    if (!SCALES.includes(state.scale)) state.scale = 1;
    const renderServings = () => {
      amounts.forEach(([el, text]) => { el.textContent = scale(text, state.scale); });
      const serves = formatRange(base.lo * state.scale, base.hi * state.scale);
      value.textContent = serves;
      if (stat) stat.textContent = serves;
      note.hidden = state.scale === 1;
      less.disabled = state.scale <= SCALES[0];
      more.disabled = state.scale >= SCALES[SCALES.length - 1];
    };
    servings.addEventListener("click", (event) => {
      const button = event.target.closest("[data-servings-step]");
      if (!button) return;
      const i = SCALES.indexOf(state.scale) + Number(button.dataset.servingsStep);
      state.scale = SCALES[Math.max(0, Math.min(SCALES.length - 1, i))];
      save();
      renderServings();
    });
    servings.hidden = false;
    renderServings();
  }

  // Favorite: a heart that's remembered in this browser (see page.js). One
  // button by the title, one on cook mode's "All done" card.
  const faves = [...recipe.querySelectorAll("[data-fave]")];
  if (faves.length) {
    const slug = faves[0].dataset.fave;
    const renderFaves = () => faves.forEach((b) => b.setAttribute("aria-pressed", String(page.favorites.has(slug))));
    faves.forEach((b) => {
      b.addEventListener("click", () => { page.favorites.set(slug, !page.favorites.has(slug)); renderFaves(); });
      b.hidden = false;
    });
    renderFaves();
  }

  // Keep the screen awake once you've started (an ingredient or step ticked),
  // so it doesn't dim while you cook from the page. Cook mode and running
  // timers ask for it themselves (see HawkinsPage.wake). Leaving the page, or
  // Start over, lets the screen sleep again (unless a timer is running).
  syncWake();
  page.onLeave(() => { page.wake.set("progress", false); page.wake.set("cook", false); });

  window.HawkinsRecipe = { el: recipe, steps, setStep, saveSteps, markUpTo };
})();
