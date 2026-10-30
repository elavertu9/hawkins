// Kitchen timers that follow you around the site. Cook mode starts them (see
// recipe.js); this file shows them in the corner of every page, beeps when
// they're done, and keeps the screen awake while any are running.
//
// Timers are saved in this browser as end times, so they keep counting across
// reloads. This script runs once per visit to the site (Turbo swaps pages in
// place; see page.js), so the tray and its sound carry from page to page. They
// can only beep while the site is open on screen, and the browser needs one tap
// after the site loads before it allows sound.
//
// cook.js uses window.HawkinsTimers:
//   start({ key, seconds, recipe, url, step, title, time })
//   isRunning(key), keys(), list(), secondsLeft(key), formatClock(seconds),
//   open(timer) (go to its step, as tapping it does),
//   onChange(fn) -> unsubscribe, tray (the element, so cook mode can hold it)
//   continueTo: set by cook mode while it's open. Given a finished timer, it
//   returns { label, go } to offer one tap to the next step instead of
//   "Continue recipe", or null.
//
// A finished timer stays up, saying which step it was for ("Step 2 timer is
// done"), with "Stop alarm" and "Go to step 2" buttons, until it's dismissed
// with its ×, or you go back to its recipe. Stopping only silences it, so you
// can finish what you're reading first (or carry on with the step you're on).
(() => {
  const KEY = "hawkins:timers";
  const MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const BEEP_FOR_MS = 60 * 1000;

  const formatClock = (seconds) => {
    const s = Math.max(0, Math.ceil(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  };

  const { store, wake } = HawkinsPage;
  const read = () => {
    const saved = store.get(KEY);
    return Array.isArray(saved) ? saved.filter((t) => t && t.key && Date.now() - t.end < MAX_AGE_MS) : [];
  };
  const write = (list) => (list.length ? store.set(KEY, list) : store.remove(KEY));

  let list = read();
  const listeners = [];

  const tray = document.createElement("div");
  tray.className = "timers";
  tray.setAttribute("aria-label", "Timers");
  tray.hidden = true;
  tray.innerHTML = '<button class="timers__sound" type="button" hidden>' +
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5zM22 9l-6 6M16 9l6 6"/></svg>' +
    'Sound is off. Tap to turn it on</button>';
  document.body.append(tray);
  // Turbo swaps in a new <body> on each page; take the tray along.
  document.addEventListener("turbo:before-render", (event) => event.detail.newBody.append(tray));
  const soundButton = tray.querySelector(".timers__sound");
  tray.addEventListener("animationend", (event) => { if (event.target === tray) tray.classList.remove("is-in"); });

  // ---------- Sound ----------
  // Browsers only allow sound after a tap on the page, so any tap unlocks it.
  let audio = null;
  const unlockAudio = () => {
    if (!audio && (window.AudioContext || window.webkitAudioContext)) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { /* no sound */ }
    }
    if (audio && audio.state !== "running") {
      audio.resume().then(renderSound, renderSound);
    }
    renderSound();
  };
  const soundReady = () => !!audio && audio.state === "running";
  const renderSound = () => { soundButton.hidden = soundReady() || !list.some((t) => !t.stopped && Date.now() - t.end < BEEP_FOR_MS); };
  ["pointerdown", "touchend", "click", "keydown"].forEach((type) =>
    document.addEventListener(type, unlockAudio, { capture: true, passive: true }));

  // A short three-note alarm.
  const beep = () => {
    if (!soundReady()) return;
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

  // ---------- Tray ----------
  const els = new Map(); // key -> { el, time, cancel, done, lastBeep }

  const samePage = (timer) => location.pathname === new URL(timer.url, location.href).pathname;
  const goTo = (timer) => {
    // On the recipe itself, cook mode jumps to the step; elsewhere, go there.
    if (samePage(timer) && document.dispatchEvent(new CustomEvent("hawkins:timer-open", { detail: timer, cancelable: true })) === false) return;
    const url = `${timer.url}#cook-${timer.step}`;
    HawkinsPage.visit(url);
  };

  const buildEl = (timer) => {
    const el = document.createElement("div");
    el.className = "timer";
    el.innerHTML =
      '<button class="timer__open" type="button"><span class="timer__step"></span><span class="timer__meta"></span></button>' +
      '<span class="timer__time"></span><button class="timer__cancel" type="button">&times;</button>' +
      '<div class="timer__actions" hidden>' +
      '<button class="button timer__stop" type="button">Stop alarm</button>' +
      '<button class="button timer__continue" type="button"></button>' +
      '</div>';
    const label = `Step ${timer.step}${timer.title ? `: ${timer.title}` : ""}`;
    el.querySelector(".timer__step").textContent = label;
    el.querySelector(".timer__meta").textContent = [timer.recipe, timer.time].filter(Boolean).join(" · ");
    const open = el.querySelector(".timer__open");
    open.setAttribute("aria-label", `${label}, ${timer.recipe}. Go to this step.`);
    open.addEventListener("click", () => goTo(timer));
    const cancel = el.querySelector(".timer__cancel");
    cancel.setAttribute("aria-label", `Cancel ${label} timer`);
    cancel.addEventListener("click", () => remove(timer.key));
    const stopButton = el.querySelector(".timer__stop");
    stopButton.setAttribute("aria-label", `Stop the ${label} alarm`);
    stopButton.addEventListener("click", () => stop(timer.key));
    const continueButton = el.querySelector(".timer__continue");
    const continueText = `Go to step ${timer.step} ›`;
    continueButton.textContent = continueText;
    const continueLabel = `Go to step ${timer.step} of ${timer.recipe}`;
    continueButton.setAttribute("aria-label", continueLabel);
    continueButton.addEventListener("click", () => {
      const next = api.continueTo && api.continueTo(timer);
      remove(timer.key);
      if (next) next.go(); else goTo(timer);
    });
    return { el, timer, time: el.querySelector(".timer__time"), cancel, actions: el.querySelector(".timer__actions"), stopButton, continueButton, continueText, continueLabel, label, done: false, lastBeep: 0 };
  };

  let tick = null;
  const update = () => {
    const now = Date.now();
    list.forEach((timer) => {
      const view = els.get(timer.key);
      const left = (timer.end - now) / 1000;
      if (left > 0) {
        view.time.textContent = formatClock(left);
        return;
      }
      if (!view.done) {
        view.done = true;
        view.el.classList.add("is-done");
        view.actions.hidden = false;
        // Say which step it was for, so going off while you're on another
        // step (or page) makes sense: "Step 2 timer is done".
        view.el.querySelector(".timer__step").textContent = `Step ${timer.step} timer is done`;
        view.el.querySelector(".timer__meta").textContent = [timer.title, timer.recipe].filter(Boolean).join(" · ");
        view.cancel.setAttribute("aria-label", `Dismiss ${view.label} timer`);
        if (navigator.vibrate && -left < 60 && !timer.stopped) navigator.vibrate([300, 150, 300, 150, 300]);
      }
      // Stopped (here or in another tab): quiet, but still waiting for you.
      view.el.classList.toggle("is-stopped", !!timer.stopped);
      view.stopButton.hidden = !!timer.stopped || now - timer.end >= BEEP_FOR_MS;
      // Finished while you were away: say how long ago.
      const ago = Math.floor(-left / 60);
      view.time.textContent = ago >= 1 ? `${ago} min ago` : "Just now";
      // In cook mode on this timer's step, offer to move straight on.
      const next = api.continueTo && api.continueTo(timer);
      view.continueButton.textContent = next ? next.label : view.continueText;
      view.continueButton.setAttribute("aria-label", next ? `Step ${timer.step} done: ${next.label.replace(/ ›$/, "")}` : view.continueLabel);
      // Beep every few seconds for a minute, or until dismissed. Only the
      // tab you're looking at beeps, so two open tabs don't both go off.
      if (!timer.stopped && now - view.lastBeep > 3000 && now - timer.end < BEEP_FOR_MS && document.visibilityState === "visible") {
        view.lastBeep = now;
        beep();
      }
    });
    renderSound();
  };

  const render = () => {
    els.forEach((view, key) => {
      if (!list.some((t) => t.key === key)) { view.el.remove(); els.delete(key); }
    });
    list.forEach((timer) => {
      if (!els.has(timer.key)) {
        const view = buildEl(timer);
        els.set(timer.key, view);
        tray.append(view.el);
      }
    });
    if (tray.hidden && list.length) tray.classList.add("is-in"); // slide in when it first appears
    tray.hidden = list.length === 0;
    if (list.length && !tick) tick = setInterval(update, 250);
    if (!list.length && tick) { clearInterval(tick); tick = null; }
    update();
    wake.set("timers", list.length > 0); // keep the screen on while any timer is up
    listeners.forEach((fn) => fn());
  };

  const remove = (key) => {
    list = list.filter((t) => t.key !== key);
    write(list);
    render();
  };

  const stop = (key) => {
    list = list.map((t) => (t.key === key ? { ...t, stopped: true } : t));
    write(list);
    render();
    const view = els.get(key);
    if (view) view.el.querySelector(".timer__continue").focus({ preventScroll: true });
  };

  const start = ({ seconds, ...timer }) => {
    unlockAudio();
    const existing = els.get(timer.key);
    if (existing) { existing.cancel.focus(); return; }
    list = [...list, { ...timer, end: Date.now() + seconds * 1000 }];
    write(list);
    render();
  };

  // Another tab started or dismissed a timer.
  addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    list = read();
    render();
  });

  // Back on the recipe of a timer that already finished: it's done its job.
  const clearFinishedHere = () => {
    const kept = list.filter((t) => !(t.end <= Date.now() && samePage(t)));
    if (kept.length === list.length) return;
    list = kept;
    write(list);
    render();
  };
  document.addEventListener("turbo:load", clearFinishedHere);

  const api = {
    start,
    isRunning: (key) => list.some((t) => t.key === key),
    keys: () => list.map((t) => t.key),
    list: () => list.map((t) => ({ ...t })),
    secondsLeft: (key) => {
      const timer = list.find((t) => t.key === key);
      return timer ? Math.max(0, (timer.end - Date.now()) / 1000) : null;
    },
    formatClock,
    open: goTo,
    continueTo: null,
    onChange: (fn) => {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    tray,
  };
  window.HawkinsTimers = api;

  write(list); // drop expired ones
  clearFinishedHere();
  render();
})();
