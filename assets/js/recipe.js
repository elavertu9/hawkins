// Recipe page helpers: check off ingredients and steps, and keep the screen
// awake. Cook mode is in cook.js, which builds on what this file shares as
// window.HawkinsRecipe.
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

  const save = () => {
    state.at = Date.now();
    page.store.set(STORAGE_KEY, state);
    resetButton.hidden = state.ingredients.length === 0 && state.steps.length === 0;
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
  const saveSteps = () => {
    state.steps = steps.map((s, i) => (s.classList.contains("is-done") ? i : -1)).filter((i) => i >= 0);
    save();
  };

  steps.forEach((step, index) => {
    setStep(step, state.steps.includes(index));

    const toggle = () => {
      setStep(step, !step.classList.contains("is-done"));
      saveSteps();
    };

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
    state.steps = [];
    syncMirrors();
    save();
  });
  resetButton.hidden = state.ingredients.length === 0 && state.steps.length === 0;

  // Keep the screen awake while cooking. The button asks for it here; cook mode
  // and running timers ask for it themselves (see HawkinsPage.wake).
  const wakeButton = recipe.querySelector("[data-wake]");
  let wakeWanted = false;
  const renderWake = () => wakeButton && wakeButton.setAttribute("aria-pressed", String(wakeWanted && page.wake.active()));

  if (wakeButton && page.wake.supported) {
    wakeButton.hidden = false;
    wakeButton.addEventListener("click", async () => {
      wakeWanted = !wakeWanted;
      await page.wake.set("button", wakeWanted);
      if (!page.wake.active()) wakeWanted = false; // the browser said no
      renderWake();
    });
    page.onLeave(page.wake.onChange(renderWake));
  }
  // Leaving the page lets the screen sleep again (unless a timer is running).
  page.onLeave(() => { page.wake.set("button", false); page.wake.set("cook", false); });

  window.HawkinsRecipe = { el: recipe, steps, setStep, saveSteps };
})();
