// Recipe page helpers: check off ingredients and steps, keep the screen awake,
// and cook mode (one step at a time, full screen, with timers).
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
  // Either the button or cook mode can ask for it; it's released when neither does.
  const wakeButton = recipe.querySelector("[data-wake]");
  const wake = { button: false, cook: false, lock: null };

  const renderWake = () => wakeButton.setAttribute("aria-pressed", String(wake.button && wake.lock !== null));

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

    // The browser drops the lock when the tab is hidden; take it back on return.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncWake();
    });
  }

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

  const formatClock = (seconds) => {
    const s = Math.max(0, Math.ceil(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  };

  const tray = document.createElement("div");
  tray.className = "timers";
  tray.setAttribute("aria-label", "Timers");
  tray.hidden = true;
  document.body.append(tray);

  const timers = [];
  let tick = null;
  let audio = null;

  // A short three-note alarm. The AudioContext is made on the tap that starts a
  // timer, since browsers only allow sound after a user gesture.
  const beep = () => {
    if (!audio) return;
    const now = audio.currentTime;
    [0, 0.22, 0.44].forEach((offset) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  };

  const removeTimer = (timer) => {
    timers.splice(timers.indexOf(timer), 1);
    timer.el.remove();
    document.querySelectorAll(`[data-timer-key="${timer.key}"]`).forEach((b) => b.classList.remove("is-running"));
    tray.hidden = timers.length === 0;
    if (!timers.length) { clearInterval(tick); tick = null; }
  };

  const update = () => {
    const now = Date.now();
    timers.forEach((timer) => {
      const left = (timer.end - now) / 1000;
      if (left > 0) {
        timer.time.textContent = formatClock(left);
        return;
      }
      if (!timer.done) {
        timer.done = true;
        timer.el.classList.add("is-done");
        timer.time.textContent = "Done";
        timer.cancel.textContent = "OK";
        timer.cancel.setAttribute("aria-label", `Dismiss ${timer.label} timer`);
        timer.lastBeep = 0;
        if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
      }
      // Keep beeping every few seconds for a minute, or until dismissed.
      if (now - timer.lastBeep > 3000 && now - timer.end < 60000) {
        timer.lastBeep = now;
        beep();
      }
    });
  };

  const startTimer = (seconds, label, key) => {
    if (!audio && (window.AudioContext || window.webkitAudioContext)) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { /* no sound */ }
    }
    if (audio && audio.state === "suspended") audio.resume();
    const existing = timers.find((t) => t.key === key);
    if (existing) { existing.cancel.focus(); return; }

    const el = document.createElement("div");
    el.className = "timer";
    el.innerHTML = '<span class="timer__label"></span><span class="timer__time"></span><button class="timer__cancel" type="button">&times;</button>';
    const timer = {
      key, label, el,
      end: Date.now() + seconds * 1000,
      time: el.querySelector(".timer__time"),
      cancel: el.querySelector(".timer__cancel"),
      done: false,
    };
    el.querySelector(".timer__label").textContent = label;
    timer.cancel.setAttribute("aria-label", `Cancel ${label} timer`);
    timer.cancel.addEventListener("click", () => removeTimer(timer));
    timers.push(timer);
    tray.append(el);
    tray.hidden = false;
    document.querySelectorAll(`[data-timer-key="${key}"]`).forEach((b) => b.classList.add("is-running"));
    update();
    if (!tick) tick = setInterval(update, 250);
  };

  // ---------- Cook mode ----------
  const cookButton = recipe.querySelector("[data-cook]");
  const dialog = recipe.querySelector("[data-cook-dialog]");
  if (!cookButton || !dialog || typeof dialog.showModal !== "function" || !steps.length) return;

  document.body.append(dialog); // keep it out of the Upside Down's rotated page
  const $ = (sel) => dialog.querySelector(sel);
  const ui = {
    count: $("[data-cook-count]"),
    progress: $("[data-cook-progress]"),
    stage: $("[data-cook-stage]"),
    step: $("[data-cook-step]"),
    num: $("[data-cook-num]"),
    title: $("[data-cook-title]"),
    text: $("[data-cook-text]"),
    panel: $("[data-cook-panel]"),
    panelToggle: $("[data-cook-ingredients]"),
    prev: $("[data-cook-prev]"),
    next: $("[data-cook-next]"),
  };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  let pushed = false;

  const showPanel = (open) => {
    ui.panel.hidden = !open;
    ui.panelToggle.setAttribute("aria-expanded", String(open));
    ui.panelToggle.setAttribute("aria-pressed", String(open));
  };

  const render = (direction = 0) => {
    const step = steps[current];
    const title = step.querySelector(".step__title");
    ui.count.textContent = `Step ${current + 1} of ${steps.length}`;
    ui.num.textContent = String(current + 1).padStart(2, "0");
    ui.title.textContent = title ? title.textContent : "";
    ui.title.hidden = !title;
    ui.text.innerHTML = step.querySelector(".step__text").innerHTML;
    ui.progress.style.width = `${((current + 1) / steps.length) * 100}%`;
    ui.prev.disabled = current === 0;
    ui.next.textContent = current === steps.length - 1 ? "Finish" : "Next";

    ui.text.querySelectorAll("strong").forEach((strong, i) => {
      const seconds = parseSeconds(strong.textContent);
      if (!seconds) return;
      const key = `${current}-${i}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timer-start";
      button.dataset.timerKey = key;
      button.textContent = strong.textContent;
      button.setAttribute("aria-label", `Start a ${strong.textContent} timer`);
      if (timers.some((t) => t.key === key)) button.classList.add("is-running");
      button.addEventListener("click", () =>
        startTimer(seconds, `Step ${current + 1} · ${strong.textContent}`, key));
      strong.replaceWith(button);
    });

    if (direction && !reduceMotion.matches) {
      ui.step.classList.remove("is-enter-next", "is-enter-prev");
      void ui.step.offsetWidth; // restart the animation
      ui.step.classList.add(direction > 0 ? "is-enter-next" : "is-enter-prev");
    }
    ui.stage.scrollTop = 0;
  };

  const go = (index) => {
    const direction = Math.sign(index - current);
    current = Math.max(0, Math.min(steps.length - 1, index));
    render(direction);
  };

  // Moving on marks the step you're leaving as done, on the page too.
  const next = () => {
    setStep(steps[current], true);
    saveSteps();
    if (current === steps.length - 1) close();
    else go(current + 1);
  };
  const prev = () => { if (current > 0) go(current - 1); };

  const open = () => {
    const firstOpen = steps.findIndex((s) => !s.classList.contains("is-done"));
    current = firstOpen === -1 ? 0 : firstOpen;
    showPanel(false);
    render();
    dialog.showModal();
    document.documentElement.classList.add("is-cooking");
    ui.next.focus();
    wake.cook = true;
    syncWake();
    // The back button (or Android's back gesture) closes cook mode. Opened from
    // a #cook link there's nothing of ours to go back to, so just drop the hash.
    pushed = location.hash !== "#cook";
    if (pushed) history.pushState({ cook: true }, "", "#cook");
  };

  const close = () => { if (dialog.open) dialog.close(); };

  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("is-cooking");
    wake.cook = false;
    syncWake();
    if (pushed && history.state && history.state.cook) history.back();
    else if (location.hash === "#cook") history.replaceState(null, "", location.pathname + location.search);
    pushed = false;
    const target = steps[current];
    if (target) target.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
    cookButton.focus({ preventScroll: true });
  });
  addEventListener("popstate", () => { if (dialog.open) dialog.close(); });

  // Escape closes the ingredients panel first, then cook mode.
  dialog.addEventListener("cancel", (event) => {
    if (!ui.panel.hidden) { event.preventDefault(); showPanel(false); }
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.target.closest("input")) return;
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
  ui.panelToggle.addEventListener("click", () => showPanel(ui.panel.hidden));

  // While cook mode is open, the timers sit inside it so they stay on top.
  const placeTray = () => (dialog.open ? dialog : document.body).append(tray);
  new MutationObserver(placeTray).observe(dialog, { attributes: true, attributeFilter: ["open"] });

  cookButton.hidden = false;
  cookButton.addEventListener("click", open);
  if (location.hash === "#cook") open();
})();
