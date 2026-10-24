// Recipe page helpers: check off ingredients and steps, and keep the screen awake.
// Progress is saved per recipe in this browser and forgotten after 12 hours,
// so a half-finished session from last week doesn't greet you next time.
(() => {
  const recipe = document.querySelector("[data-recipe-id]");
  if (!recipe) return;

  const STORAGE_KEY = `hawkins:recipe:${recipe.dataset.recipeId}`;
  const MAX_AGE_MS = 12 * 60 * 60 * 1000;

  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Date.now() - saved.at < MAX_AGE_MS) return saved;
    } catch (_) { /* storage unavailable or corrupt */ }
    return { ingredients: [], steps: [] };
  };

  const state = load();

  const save = () => {
    state.at = Date.now();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
    resetButton.hidden = state.ingredients.length === 0 && state.steps.length === 0;
  };

  const boxes = [...recipe.querySelectorAll(".checklist input[type=checkbox]")];
  const steps = [...recipe.querySelectorAll(".step")];
  const resetButton = recipe.querySelector("[data-reset]");

  // Ingredients
  boxes.forEach((box) => {
    box.checked = state.ingredients.includes(box.dataset.key);
    box.addEventListener("change", () => {
      state.ingredients = boxes.filter((b) => b.checked).map((b) => b.dataset.key);
      save();
    });
  });

  // Steps
  const setStep = (step, done) => {
    step.classList.toggle("is-done", done);
    const button = step.querySelector(".step__num");
    button.setAttribute("aria-pressed", String(done));
  };

  steps.forEach((step, index) => {
    setStep(step, state.steps.includes(index));

    const toggle = () => {
      const done = !step.classList.contains("is-done");
      setStep(step, done);
      state.steps = steps.map((s, i) => (s.classList.contains("is-done") ? i : -1)).filter((i) => i >= 0);
      save();
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
    save();
  });
  resetButton.hidden = state.ingredients.length === 0 && state.steps.length === 0;

  // Keep the screen awake while cooking (Screen Wake Lock API, where supported)
  const wakeButton = recipe.querySelector("[data-wake]");
  if (wakeButton && "wakeLock" in navigator) {
    let lock = null;
    let wanted = false;

    const render = () => wakeButton.setAttribute("aria-pressed", String(wanted && lock !== null));

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { lock = null; render(); });
      } catch (_) {
        lock = null;
        wanted = false;
      }
      render();
    };

    wakeButton.hidden = false;
    wakeButton.addEventListener("click", async () => {
      wanted = !wanted;
      if (wanted) {
        await acquire();
      } else if (lock) {
        await lock.release();
      }
      render();
    });

    // The browser drops the lock when the tab is hidden; take it back on return.
    document.addEventListener("visibilitychange", () => {
      if (wanted && !lock && document.visibilityState === "visible") acquire();
    });
  }
})();
