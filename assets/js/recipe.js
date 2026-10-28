// Recipe page helpers: check off ingredients and steps, keep the screen awake,
// and cook mode (one step at a time, full screen, with timers).
// Progress is saved per recipe in this browser and forgotten after 12 hours,
// so a half-finished session from last week doesn't greet you next time.
(() => {
  const recipe = document.querySelector("[data-recipe-id]");
  if (!recipe) return;

  // Window and document listeners go through HawkinsPage so they're removed
  // when Turbo swaps in the next page (see page.js).
  const page = window.HawkinsPage || { on: (t, type, fn, o) => t.addEventListener(type, fn, o), onLeave() {} };

  const STORAGE_KEY = `hawkins:recipe:${recipe.dataset.recipeId}`;
  // Set once someone starts their first timer; until then cook mode explains them.
  const TIMER_HINT_KEY = "hawkins:timer-hint-seen";
  const timerHintSeen = () => { try { return localStorage.getItem(TIMER_HINT_KEY) === "1"; } catch (_) { return false; } };
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

  // Keep the screen awake while cooking (Screen Wake Lock API, where supported).
  // Either the button or cook mode can ask for it; it's released when neither
  // does. Running timers keep the screen on by themselves (timers.js).
  const wakeButton = recipe.querySelector("[data-wake]");
  const wake = { button: false, cook: false, lock: null };

  const renderWake = () => wakeButton && wakeButton.setAttribute("aria-pressed", String(wake.button && wake.lock !== null));

  const syncWake = async () => {
    if (!("wakeLock" in navigator)) return;
    const wanted = wake.button || wake.cook;
    if (wanted && !wake.lock) {
      try {
        wake.lock = await navigator.wakeLock.request("screen");
        wake.lock.addEventListener("release", () => { wake.lock = null; renderWake(); });
      } catch (_) {
        wake.lock = null;
        wake.button = false;
      }
    } else if (!wanted && wake.lock) {
      await wake.lock.release();
    }
    renderWake();
  };

  if (wakeButton && "wakeLock" in navigator) {
    wakeButton.hidden = false;
    wakeButton.addEventListener("click", () => {
      wake.button = !wake.button;
      syncWake();
    });
  }

  // The browser drops the lock when the tab is hidden; take it back on return.
  page.on(document, "visibilitychange", () => {
    if (document.visibilityState === "visible") syncWake();
  });
  // Leaving the page: let the screen sleep again (running timers keep their
  // own wake lock in timers.js).
  page.onLeave(() => {
    wake.button = false;
    wake.cook = false;
    if (wake.lock) wake.lock.release();
  });

  // ---------- Timers ----------
  // Bold times in a step ("**10 minutes**", "**7–8 minutes**") become buttons
  // in cook mode. A range starts at the low end, so you check early.
  const TIME_RE = /^(\d+(?:\.\d+)?[½¼¾]?|[½¼¾])(?:\s*(?:–|-|to)\s*\d+(?:\.\d+)?[½¼¾]?)?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)$/i;
  const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75 };

  const parseSeconds = (text) => {
    const match = text.trim().match(TIME_RE);
    if (!match) return 0;
    const [, amount, unit] = match;
    const frac = FRACTIONS[amount.slice(-1)] || 0;
    const whole = parseFloat(amount) || 0;
    const value = whole + frac;
    const per = /^s/i.test(unit) ? 1 : /^h/i.test(unit) ? 3600 : 60;
    return Math.round(value * per);
  };

  // The timers themselves live in timers.js, on every page of the site.
  const Timers = window.HawkinsTimers;
  const recipeTitle = (recipe.querySelector("h1") || document.querySelector("h1") || {}).textContent || "";
  const recipeKey = recipe.dataset.recipeId;

  const startTimer = (seconds, info) => {
    if (!Timers) return;
    Timers.start({ ...info, seconds, recipe: recipeTitle.trim(), url: location.pathname });
    try { localStorage.setItem(TIMER_HINT_KEY, "1"); } catch (_) { /* ignore */ }
    document.querySelectorAll(".cook__hint").forEach((h) => h.remove());
    document.querySelectorAll(".timer-start.is-new").forEach((b) => b.classList.remove("is-new"));
  };
  const syncTimerButtons = () => document.querySelectorAll("[data-timer-key]").forEach((b) =>
    b.classList.toggle("is-running", !!Timers && Timers.isRunning(b.dataset.timerKey)));
  if (Timers) page.onLeave(Timers.onChange(syncTimerButtons));

  // ---------- Cook mode ----------
  const cookButton = recipe.querySelector("[data-cook]");
  const dialog = recipe.querySelector("[data-cook-dialog]");
  if (!cookButton || !dialog || typeof dialog.showModal !== "function" || !steps.length) return;

  document.body.append(dialog); // keep it out of the Upside Down's rotated page
  const $ = (sel) => dialog.querySelector(sel);
  const ui = {
    count: $("[data-cook-count]"),
    segments: $("[data-cook-segments]"),
    stage: $("[data-cook-stage]"),
    step: $("[data-cook-step]"),
    num: $("[data-cook-num]"),
    title: $("[data-cook-title]"),
    text: $("[data-cook-text]"),
    panel: $("[data-cook-panel]"),
    panelToggle: $("[data-cook-ingredients]"),
    stepsPanel: $("[data-cook-steps-panel]"),
    stepsToggle: $("[data-cook-steps-toggle]"),
    stepList: $("[data-cook-step-list]"),
    restartLink: $("[data-cook-restart-link]"),
    resume: $("[data-cook-resume]"),
    finished: $("[data-cook-finished]"),
    prev: $("[data-cook-prev]"),
    next: $("[data-cook-next]"),
  };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  let pushed = false;

  // Ingredients, the step list, and the "welcome back" and "all done" cards are
  // sheets that cover the whole step view.
  // While one is up, the step, Back / Next, and close button underneath are
  // inert, so stray taps can't move or close cook mode. Running timers stay
  // usable on top.
  const underPanel = [$(".cook__bar"), ui.segments, ui.stage, $(".cook__nav")];
  const sheets = {
    ingredients: { el: ui.panel, toggle: ui.panelToggle },
    steps: { el: ui.stepsPanel, toggle: ui.stepsToggle },
    resume: { el: ui.resume },
    finished: { el: ui.finished },
  };
  let openSheet = null;
  const showSheet = (name) => {
    const was = openSheet;
    openSheet = name;
    Object.entries(sheets).forEach(([key, sheet]) => {
      sheet.el.hidden = key !== name;
      if (sheet.toggle) sheet.toggle.setAttribute("aria-expanded", String(key === name));
    });
    underPanel.forEach((el) => { el.inert = !!name; });
    if (name) {
      const sheet = sheets[name].el;
      const back = sheet.querySelector("[data-cook-sheet-back]");
      const list = sheet.querySelector(".cook__panel-list");
      if (back) back.textContent = `Back to step ${current + 1}`;
      if (list) list.scrollTop = 0;
      if (name === "steps") {
        renderStepList();
        const here = ui.stepList.querySelector("[aria-current]");
        here.scrollIntoView({ block: "center" });
        here.focus({ preventScroll: true });
      } else {
        (back || sheet.querySelector(".button")).focus({ preventScroll: true });
      }
    } else if (was && dialog.open) {
      (sheets[was].toggle || ui.next).focus({ preventScroll: true });
    }
  };
  const showPanel = (open) => showSheet(open ? "ingredients" : null);
  const panelOpen = () => openSheet !== null;

  // ---------- Progress ----------
  // Progress follows where you are in cook mode: every step before the one
  // you're on counts as done, and the rest don't, however you got there (Next,
  // Back, the bar, or the step list). So the bar never has gaps, and peeking
  // ahead then coming back leaves nothing wrongly ticked. On the page itself,
  // steps can still be ticked one by one.
  const reached = () => {
    for (let i = steps.length; i > 0; i--) if (steps[i - 1].classList.contains("is-done")) return i;
    return 0;
  };
  const isDone = (index) => index < reached();
  const restart = () => {
    showSheet(null);
    go(0);
  };

  // ---------- Picking a step ----------
  // The segments along the top and the step list both jump straight to a step.
  const stepTitle = (step) => {
    const title = step.querySelector(".step__title");
    if (title) return title.textContent.trim();
    const text = step.querySelector(".step__text").textContent.trim().replace(/\s+/g, " ");
    return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text;
  };
  const hasTimer = (index) => !!Timers && Timers.keys().some((k) => k.startsWith(`${recipeKey}:${index}-`));
  const stepState = (index) =>
    index === current ? "current step" : isDone(index) ? "done" : "not started";

  const segments = steps.map((step, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cook__seg";
    button.innerHTML = `<span class="cook__seg-num" aria-hidden="true">${i + 1}</span>`;
    button.addEventListener("click", () => go(i));
    ui.segments.append(button);
    return button;
  });
  const renderSegments = () => segments.forEach((button, i) => {
    button.classList.toggle("is-done", isDone(i));
    button.classList.toggle("is-current", i === current);
    button.classList.toggle("has-timer", hasTimer(i));
    button.setAttribute("aria-label", `Step ${i + 1}: ${stepTitle(steps[i])}, ${stepState(i)}${hasTimer(i) ? ", timer running" : ""}`);
    if (i === current) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });

  const stepItems = steps.map((step, i) => {
    const li = document.createElement("li");
    li.innerHTML = '<button class="cook__pick" type="button"><span class="cook__pick-num"></span><span class="cook__pick-title"></span><span class="cook__pick-state"></span></button>';
    const button = li.querySelector("button");
    button.querySelector(".cook__pick-num").textContent = String(i + 1).padStart(2, "0");
    button.querySelector(".cook__pick-title").textContent = stepTitle(step);
    button.addEventListener("click", () => { showSheet(null); go(i); });
    ui.stepList.append(li);
    return button;
  });
  const renderStepList = () => stepItems.forEach((button, i) => {
    ui.restartLink.hidden = reached() === 0;
    const done = isDone(i);
    button.classList.toggle("is-done", done);
    button.classList.toggle("has-timer", hasTimer(i));
    button.querySelector(".cook__pick-state").textContent =
      i === current ? "You're here" : hasTimer(i) ? "⏱\uFE0E Timer" : done ? "Done" : "";
    if (i === current) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  if (Timers) page.onLeave(Timers.onChange(() => { renderSegments(); if (openSheet === "steps") renderStepList(); }));

  const render = (direction = 0) => {
    const step = steps[current];
    const title = step.querySelector(".step__title");
    ui.count.textContent = `Step ${current + 1} of ${steps.length}`;
    ui.num.textContent = String(current + 1).padStart(2, "0");
    ui.title.textContent = title ? title.textContent : "";
    ui.title.hidden = !title;
    ui.text.innerHTML = step.querySelector(".step__text").innerHTML;
    renderSegments();
    ui.prev.disabled = current === 0;
    ui.next.textContent = current === steps.length - 1 ? "Finish" : "Next";

    ui.text.querySelectorAll("strong").forEach((strong, i) => {
      const seconds = parseSeconds(strong.textContent);
      if (!seconds) return;
      const key = `${recipeKey}:${current}-${i}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timer-start";
      button.dataset.timerKey = key;
      button.textContent = strong.textContent;
      button.setAttribute("aria-label", `Start a ${strong.textContent} timer`);
      if (Timers && Timers.isRunning(key)) button.classList.add("is-running");
      const stepTitle = title ? title.textContent.trim() : "";
      button.addEventListener("click", () =>
        startTimer(seconds, { key, step: current + 1, title: stepTitle, time: strong.textContent }));
      strong.replaceWith(button);
    });

    const timerButtons = ui.text.querySelectorAll(".timer-start");
    if (timerButtons.length && !timerHintSeen()) {
      timerButtons.forEach((b) => b.classList.add("is-new"));
      const hint = document.createElement("p");
      hint.className = "cook__hint";
      hint.textContent = "Tap a highlighted time to start a timer.";
      ui.text.append(hint);
    }

    if (direction && !reduceMotion.matches) {
      ui.step.classList.remove("is-enter-next", "is-enter-prev");
      void ui.step.offsetWidth; // restart the animation
      ui.step.classList.add(direction > 0 ? "is-enter-next" : "is-enter-prev");
    }
    ui.stage.scrollTop = 0;
  };

  const markUpTo = (index) => {
    steps.forEach((s, i) => setStep(s, i < index));
    saveSteps();
  };
  const go = (index) => {
    const direction = Math.sign(index - current);
    current = Math.max(0, Math.min(steps.length - 1, index));
    markUpTo(current);
    render(direction);
  };

  // Moving on marks the step you're leaving as done, on the page too.
  const next = () => {
    if (current === steps.length - 1) { markUpTo(steps.length); showSheet("finished"); }
    else go(current + 1);
  };
  const prev = () => { if (current > 0) go(current - 1); };

  const COOK_HASH = /^#cook(?:-(\d+))?$/;
  // Opened with a step (a timer, a #cook-3 link) goes straight there. Otherwise
  // pick up where you left off, after asking; a recipe you finished last time
  // starts fresh. Progress older than 12 hours is already gone (see load).
  const open = (stepNumber) => {
    let ask = false;
    if (stepNumber >= 1 && stepNumber <= steps.length) {
      current = stepNumber - 1;
      markUpTo(current);
    } else {
      if (reached() === steps.length) { steps.forEach((s) => setStep(s, false)); saveSteps(); }
      current = reached();
      ask = current > 0;
    }
    showSheet(null);
    render();
    dialog.showModal();
    document.documentElement.classList.add("is-cooking");
    page.onLeave(() => document.documentElement.classList.remove("is-cooking"));
    ui.next.focus();
    if (ask) {
      ui.resume.querySelector("[data-cook-resume-title]").textContent = `Pick up at step ${current + 1}?`;
      ui.resume.querySelector("[data-cook-resume-text]").textContent = stepTitle(steps[current]);
      ui.resume.querySelector("[data-cook-resume-continue]").textContent = `Continue at step ${current + 1}`;
      showSheet("resume");
    }
    wake.cook = true;
    syncWake();
    // The back button (or Android's back gesture) closes cook mode. Opened from
    // a #cook link there's nothing of ours to go back to, so just drop the hash.
    pushed = !COOK_HASH.test(location.hash);
    // Keep Turbo's entry data (history.state.turbo) so Back still works after
    // moving on to another page from cook mode.
    if (pushed) history.pushState({ ...history.state, cook: true }, "", "#cook");
  };

  const close = () => { if (dialog.open) dialog.close(); };

  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("is-cooking");
    wake.cook = false;
    syncWake();
    if (pushed && history.state && history.state.cook) history.back();
    else if (COOK_HASH.test(location.hash)) history.replaceState(history.state, "", location.pathname + location.search);
    pushed = false;
    const target = steps[current];
    if (target) target.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
    cookButton.focus({ preventScroll: true });
  });
  // Back (button or gesture) with a sheet up closes just the sheet.
  page.on(window, "popstate", () => {
    if (!dialog.open) return;
    if (panelOpen()) {
      showPanel(false);
      history.pushState({ ...history.state, cook: true }, "", "#cook");
      pushed = true;
      return;
    }
    dialog.close();
  });

  // Escape closes a sheet first, then cook mode.
  dialog.addEventListener("cancel", (event) => {
    if (panelOpen()) { event.preventDefault(); showPanel(false); }
  });

  dialog.addEventListener("keydown", (event) => {
    // Escape closes a sheet first. Handled here as well as on "cancel", which
    // Chrome won't let us stop unless the page was tapped or typed in first.
    if (event.key === "Escape" && panelOpen()) { event.preventDefault(); showSheet(null); return; }
    if (event.target.closest("input") || panelOpen()) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); next(); }
    if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); prev(); }
  });

  // Swipe left or right on the step to move between steps.
  let touch = null;
  ui.stage.addEventListener("touchstart", (event) => {
    const t = event.touches[0];
    touch = event.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  ui.stage.addEventListener("touchend", (event) => {
    if (!touch) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) next(); else prev();
  });

  ui.next.addEventListener("click", next);
  ui.prev.addEventListener("click", prev);
  $("[data-cook-close]").addEventListener("click", close);
  ui.panelToggle.addEventListener("click", () => showSheet("ingredients"));
  ui.stepsToggle.addEventListener("click", () => showSheet("steps"));
  dialog.querySelectorAll("[data-cook-sheet-close]").forEach((b) => b.addEventListener("click", () => showSheet(null)));
  dialog.querySelectorAll("[data-cook-restart]").forEach((b) => b.addEventListener("click", restart));
  $("[data-cook-finish-close]").addEventListener("click", close);
  // Tapped Finish by mistake: back to the last step, not done yet.
  $("[data-cook-finish-back]").addEventListener("click", () => {
    markUpTo(current);
    showSheet(null);
    render();
  });

  // While cook mode is open, the timers sit inside it so they stay on top.
  if (Timers) {
    const placeTray = () => (dialog.open ? dialog : document.body).append(Timers.tray);
    new MutationObserver(placeTray).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  }

  // Tapping a timer for this recipe jumps cook mode to its step.
  page.on(document, "hawkins:timer-open", (event) => {
    event.preventDefault();
    if (panelOpen()) showPanel(false);
    if (dialog.open) go(event.detail.step - 1);
    else open(event.detail.step);
  });

  cookButton.hidden = false;
  cookButton.addEventListener("click", () => open());
  const deepLink = location.hash.match(COOK_HASH);
  if (deepLink) open(Number(deepLink[1]));
})();
