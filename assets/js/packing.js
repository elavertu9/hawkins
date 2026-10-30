// Packing lists: pick how many days and what kind of trip, then check things off.
// Core kits are always on; trip kits get toggled. The trip is saved in this
// browser (it never expires) and can be shared as a link
// (/packing/?d=7&k=flying,warm,swim).
//
// A row says what it is without words: a packed one has the red ✓ and a line
// through it, a skipped one a slashed circle and faded text. The checkbox's
// label says it for screen readers.
//
// An item is to pack, packed, or skipped ("not taking it this trip"). How much
// of the trip is decided (packed + skipped, out of everything) is saved with
// it as `progress`, since packing-status.js shows it on every page (the header
// badge, and Pick up where you left off on the home page) and only this page
// has the kit data to count it.
(() => {
  const page = document.querySelector("[data-pack-page]");
  const dataEl = document.getElementById("pack-data");
  if (!page || !dataEl) return;

  const STORAGE_KEY = "hawkins:packing";
  const DAYS_MIN = 1;
  const DAYS_MAX = 30;
  const DAYS_DEFAULT = 3;

  const { store } = HawkinsPage;
  const data = JSON.parse(dataEl.textContent);
  const $ = (sel) => page.querySelector(sel);

  const kitsById = new Map(data.kits.map((k) => [k.id, k]));
  const coreIds = data.kits.filter((k) => k.core).map((k) => k.id);
  const tripKits = data.kits.filter((k) => !k.core);
  const tripIds = new Set(tripKits.map((k) => k.id));
  const dayCount = (n) => `${n} day${n === 1 ? "" : "s"}`;

  // ---------- Saved trip ----------
  const clampDays = (n) => Math.max(DAYS_MIN, Math.min(DAYS_MAX, Math.round(Number(n)) || DAYS_DEFAULT));
  const ordered = (ids) => tripKits.map((k) => k.id).filter((id) => ids.includes(id));
  const strings = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
  const blank = () => ({ days: DAYS_DEFAULT, kits: [], checked: [], skipped: [], extras: [], setupFolded: false });
  const load = () => {
    const saved = store.get(STORAGE_KEY);
    if (saved && typeof saved === "object") {
      const checked = strings(saved.checked);
      return {
        days: clampDays(saved.days),
        kits: ordered(Array.isArray(saved.kits) ? saved.kits : []),
        checked,
        // An item is packed or skipped, never both.
        skipped: strings(saved.skipped).filter((id) => !checked.includes(id)),
        extras: Array.isArray(saved.extras) ? saved.extras.filter((x) => x && typeof x.id === "string" && typeof x.item === "string") : [],
        setupFolded: saved.setupFolded === true,
      };
    }
    return blank();
  };

  let state = load();
  let hasTrip = store.getText(STORAGE_KEY) !== null; // saved before, or still the empty start
  let renderPage = () => {};

  // ?d=5&k=flying,swim: the trip as a link.
  const tripQuery = () => {
    const params = new URLSearchParams({ d: state.days });
    if (state.kits.length) params.set("k", state.kits.join(","));
    return `?${params.toString().replace(/%2C/g, ",")}`;
  };
  const syncUrl = () => HawkinsPage.replaceUrl(`${location.pathname}${tripQuery()}${location.hash}`);

  const save = () => {
    state.progress = progress();
    store.set(STORAGE_KEY, state);
    hasTrip = true;
    syncUrl();
    renderPage();
  };

  // ---------- What's on the list ----------
  // Core kits are always on. An item in several kits (Sunscreen) shows once,
  // under the first kit that's on, and an item with `when: "cold+dressy"` waits
  // until all of those kits are on.
  const qtyOf = (item) => {
    if (!item.qty) return null;
    const { per_day: perDay = 0, plus = 0, per_week: perWeek = 0, max = Infinity } = item.qty;
    return Math.min(max, Math.max(1, Math.ceil(state.days * perDay) + plus + perWeek * Math.floor(state.days / 7)));
  };

  const shownKits = (kits = state.kits) => {
    const on = new Set([...coreIds, ...kits]);
    const seen = new Set();
    const groups = data.kits.filter((kit) => on.has(kit.id)).map((kit) => ({
      id: kit.id,
      name: kit.name,
      tips: kit.tips,
      items: kit.items.filter((item) => {
        if (item.when && !item.when.split("+").every((id) => on.has(id))) return false;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }).map((item) => ({ id: item.id, item: item.item, qty: qtyOf(item), task: !!item.task, kit: kit.name })),
    })).filter((group) => group.items.length);
    // Extras is always the last kit, even when it's empty: that's where you add your own.
    groups.push({ id: "extras", name: "Extras", items: state.extras.map((x) => ({ id: x.id, item: x.item, qty: null, task: false, extra: true, kit: "Extras" })) });
    return groups;
  };

  // How much is decided: packed, skipped, and everything on the list.
  const progress = () => {
    const items = shownKits().flatMap((group) => group.items);
    return {
      packed: items.filter((i) => state.checked.includes(i.id)).length,
      skipped: items.filter((i) => state.skipped.includes(i.id)).length,
      total: items.length,
    };
  };

  // How many items a trip kit adds to the list: what shows with it on and not
  // without it, so an item another kit already brings (Sunscreen) isn't counted
  // again. The same number answers "what would
  // turning it on add?" and "what does it bring?", so a chip shows it either way.
  const shownIds = (kits) => new Set(shownKits(kits).flatMap((group) => group.items).map((i) => i.id));
  const kitGain = (id) => {
    const without = shownIds(state.kits.filter((k) => k !== id));
    const withIt = shownIds(ordered([...state.kits, id]));
    return [...withIt].filter((item) => !without.has(item)).length;
  };
  const itemCount = (n) => `${n} item${n === 1 ? "" : "s"}`;

  // ---------- Elements ----------
  const ui = {
    shared: $("[data-pack-shared]"),
    main: $("[data-pack-ui]"),
    summary: $("[data-pack-summary]"),
    summaryText: $("[data-pack-summary-text]"),
    summaryDone: $("[data-pack-summary-done]"),
    setupBody: $("[data-pack-setup-body]"),
    presets: $("[data-pack-presets-block]"),
    newTrip: $("[data-pack-new]"),
    daysValue: $("[data-pack-days-value]"),
    chips: $("[data-pack-kit-chips]"),
    count: $("[data-pack-count]"),
    bar: $("[data-pack-bar]"),
    barFill: $("[data-pack-bar-fill]"),
    kits: $("[data-pack-kits]"),
    tripTools: $("[data-pack-trip-tools]"),
    toast: $("[data-pack-toast]"),
    toastText: $("[data-pack-toast-text]"),
    toastAction: $("[data-pack-toast-action]"),
  };

  // A short message at the bottom of the screen, with an optional button
  // (Undo, unless it says otherwise: Show).
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let toastTimer = null;
  let toastRun = null;
  const toast = (message, run, label = "Undo") => {
    ui.toastText.textContent = message;
    toastRun = run || null;
    ui.toastAction.textContent = label;
    ui.toastAction.hidden = !run;
    ui.toast.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.classList.remove("is-shown"); toastRun = null; }, run ? 6000 : 2500);
  };
  ui.toastAction.addEventListener("click", () => {
    if (toastRun) toastRun();
    toastRun = null;
    ui.toast.classList.remove("is-shown");
  });

  // Undo puts back exactly what was there before.
  const snapshot = () => JSON.parse(JSON.stringify(state));
  const restore = (saved) => () => { state = saved; save(); };

  // Another tab changed the trip. Through HawkinsPage, so it's removed when
  // Turbo swaps in the next page (see page.js).
  HawkinsPage.on(window, "storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = load();
    hasTrip = store.getText(STORAGE_KEY) !== null;
    renderPage();
  });

  // ---------- Trip setup ----------
  const summaryParts = (days, kits) => [dayCount(days), ...kits.map((id) => kitsById.get(id).name)];

  // The setup stays open (no folding under your finger) until you tap Done,
  // which folds it into one line, and that's remembered with the trip. Edit
  // opens it again.
  const renderFold = () => {
    const folded = hasTrip && state.setupFolded;
    ui.summary.hidden = !folded;
    ui.summary.setAttribute("aria-expanded", String(!folded));
    ui.setupBody.hidden = folded;
    ui.summaryDone.hidden = !(hasTrip && !folded);
    ui.summaryText.textContent = summaryParts(state.days, state.kits).join(" · ");
    // The presets are for starting out; with a trip, Start a new trip clears it.
    ui.presets.hidden = hasTrip;
    ui.tripTools.hidden = !hasTrip;
  };
  ui.summary.addEventListener("click", () => {
    state.setupFolded = false;
    save();
    ui.setupBody.querySelector("h2").scrollIntoView({ block: "nearest" });
  });
  ui.summaryDone.addEventListener("click", () => {
    state.setupFolded = true;
    save();
    ui.summary.focus();
  });
  // Clears the trip (Undo brings it back) and opens a blank setup with the presets.
  ui.newTrip.addEventListener("click", () => {
    finishTrip();
    ui.presets.querySelector("a").focus();
  });

  const setDays = (days) => {
    state.days = clampDays(days);
    save();
  };
  ui.setupBody.querySelectorAll("[data-pack-days]").forEach((button) => {
    button.addEventListener("click", () => setDays(state.days + Number(button.dataset.packDays)));
  });

  // A kit that was just added glows for a moment, so you can see where it went
  // (not with reduced motion). Show scrolls to it, and plays the glow again if
  // it has finished by the time it gets there.
  const GLOW_MS = 1500;
  let glowing = null; // { id, timer }
  const glowKit = (id) => {
    if (reduceMotion.matches || glowing?.id === id) return;
    clearTimeout(glowing?.timer);
    const clear = () => ui.kits.querySelectorAll(".is-new").forEach((card) => card.classList.remove("is-new"));
    clear();
    glowing = { id, timer: setTimeout(() => { glowing = null; clear(); }, GLOW_MS) };
    ui.kits.querySelector(`[data-pack-kit-id="${id}"]`)?.classList.add("is-new");
  };
  const showKit = (id) => {
    const card = ui.kits.querySelector(`[data-pack-kit-id="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ block: "start", behavior: reduceMotion.matches ? "auto" : "smooth" });
    // Once it stops scrolling (or right away, if it was already in place).
    let arrived = false;
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      clearTimeout(fallback);
      removeEventListener("scrollend", arrive);
      glowKit(id);
    };
    const fallback = setTimeout(arrive, 900);
    addEventListener("scrollend", arrive);
  };

  const toggleKit = (id) => {
    const before = snapshot();
    const on = state.kits.includes(id);
    const added = on ? 0 : kitGain(id);
    state.kits = ordered(on ? state.kits.filter((k) => k !== id) : [...state.kits, id]);
    save();
    const name = kitsById.get(id).name;
    if (on) return toast(`${name} is off`, restore(before));
    glowKit(id);
    toast(`Added ${name} · ${itemCount(added)}`, ui.kits.querySelector(`[data-pack-kit-id="${id}"]`) ? () => showKit(id) : null, "Show");
  };
  const chips = tripKits.map((kit) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.innerHTML = `<span class="chip__name"></span><span class="chip__count" aria-hidden="true"></span>`;
    chip.querySelector(".chip__name").textContent = kit.name;
    chip.dataset.packKit = kit.id;
    chip.addEventListener("click", () => toggleKit(kit.id));
    return chip;
  });
  // One row per `group:` (Getting there, Weather, Plans), in the order they first appear.
  ui.chips.append(...[...new Set(tripKits.map((kit) => kit.group))].map((name, i) => {
    const group = document.createElement("div");
    group.className = "pack-group";
    group.innerHTML = `<p class="suggest__label pack-group__label" id="pack-group-${i}"></p><div class="chips pack-chips" role="group" aria-labelledby="pack-group-${i}"></div>`;
    group.querySelector(".pack-group__label").textContent = name;
    group.querySelector(".pack-chips").append(...chips.filter((chip) => kitsById.get(chip.dataset.packKit).group === name));
    return group;
  }));

  const renderSetup = () => {
    ui.daysValue.textContent = dayCount(state.days);
    ui.setupBody.querySelector('[data-pack-days="-1"]').disabled = state.days <= DAYS_MIN;
    ui.setupBody.querySelector('[data-pack-days="1"]').disabled = state.days >= DAYS_MAX;
    chips.forEach((chip) => {
      const id = chip.dataset.packKit;
      const on = state.kits.includes(id);
      const gain = kitGain(id);
      // "+5" is what the kit adds to the list, on or off (so a chip doesn't
      // change width when you tap it); nothing when it adds nothing.
      const count = chip.querySelector(".chip__count");
      count.textContent = `+${gain}`;
      count.hidden = gain === 0;
      chip.setAttribute("aria-pressed", String(on));
      chip.setAttribute("aria-label", gain ? `${kitsById.get(id).name}, ${on ? "brings" : "adds"} ${itemCount(gain)}` : kitsById.get(id).name);
    });
    renderFold();
  };

  // ---------- The checklist ----------
  const folds = new Map(); // kit id -> true if it's folded, false if it's open
  const wasComplete = new Map();

  // Packing an item (even one you'd skipped) takes the skip off.
  const checkItem = (id) => {
    state.checked = [...new Set([...state.checked, id])];
    state.skipped = state.skipped.filter((k) => k !== id);
    save();
  };
  const skipItem = (id) => {
    state.skipped = [...new Set([...state.skipped, id])];
    state.checked = state.checked.filter((k) => k !== id);
    save();
  };

  const renderRow = (item, checked, skipped) => {
    const li = document.createElement("li");
    li.className = "shopping__row pack-row";
    li.innerHTML = `
      <label class="check">
        <input type="checkbox">
        <span class="check__box" aria-hidden="true"></span>
        <span class="check__text"><span class="pack-row__name"></span> <span class="qty"></span></span>
      </label>`;
    const box = li.querySelector("input");
    const isSkipped = skipped.has(item.id);
    box.checked = checked.has(item.id);
    li.classList.toggle("is-skipped", isSkipped);
    li.querySelector(".pack-row__name").textContent = item.item;
    const qty = li.querySelector(".qty");
    qty.textContent = item.qty ? `×${item.qty}` : "";
    qty.hidden = !item.qty;
    // The state isn't written on the row, so the checkbox says it instead.
    const said = [item.item, item.qty, item.task && "to do", isSkipped && "not taking"].filter(Boolean);
    if (said.length > 1) box.setAttribute("aria-label", said.join(", "));

    // A row never moves when you tap it: a packed one strikes through where it is.
    box.addEventListener("change", () => {
      if (box.checked) return checkItem(item.id);
      state.checked = state.checked.filter((k) => k !== item.id);
      save();
    });

    if (item.extra) {
      li.insertAdjacentHTML("beforeend", `<button class="shopping__action shopping__action--remove" type="button">&times;</button>`);
      const remove = li.querySelector(".shopping__action");
      remove.setAttribute("aria-label", `Remove ${item.item}`);
      remove.addEventListener("click", () => {
        const before = snapshot();
        state.extras = state.extras.filter((x) => x.id !== item.id);
        state.checked = state.checked.filter((k) => k !== item.id);
        state.skipped = state.skipped.filter((k) => k !== item.id);
        save();
        toast(`Removed ${item.item}`, restore(before));
      });
    } else if (!checked.has(item.id)) {
      // Skip: not taking it this trip. On a skipped row the same spot says Bring.
      li.insertAdjacentHTML("beforeend", `<button class="shopping__action pack-row__skip" type="button"></button>`);
      const action = li.querySelector(".shopping__action");
      action.textContent = isSkipped ? "Bring" : "Skip";
      action.setAttribute("aria-label", `${isSkipped ? "Bring" : "Skip"} ${item.item}`);
      action.addEventListener("click", () => {
        if (!isSkipped) return skipItem(item.id);
        state.skipped = state.skipped.filter((k) => k !== item.id);
        save();
      });
    }
    return li;
  };

  // Your own items go in the Extras kit, on its last row: type and press Enter.
  // One row for the life of the page, so what you've typed (and the keyboard)
  // survives the list redrawing.
  const addRow = document.createElement("li");
  addRow.className = "pack-add";
  addRow.innerHTML = `
    <label class="visually-hidden" for="pack-extra">Add your own item</label>
    <span class="pack-add__plus" aria-hidden="true">+</span>
    <input class="pack-add__input" id="pack-extra" type="text" placeholder="Add an item…" autocomplete="off" enterkeyhint="enter" data-pack-extra-input>`;
  const addInput = addRow.querySelector("input");
  addInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    const item = addInput.value.replace(/\s+/g, " ").trim();
    addInput.value = "";
    if (!item) return;
    state.extras.push({ id: `x-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, item });
    save();
  });

  // A kit's tips (Flying: TSA rules), folded under its list. Kits are redrawn on
  // every check, so whether it's open is kept here.
  const tipsOpen = new Set();
  const renderTips = (group, folded) => {
    const tips = document.createElement("details");
    tips.className = "pack-tips";
    tips.hidden = folded;
    tips.open = tipsOpen.has(group.id);
    tips.innerHTML = `<summary></summary><ul></ul><p class="pack-tips__links"></p>`;
    tips.querySelector("summary").textContent = group.tips.title;
    tips.querySelector("ul").append(...group.tips.items.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }));
    const links = tips.querySelector(".pack-tips__links");
    (group.tips.links || []).forEach((link, i) => {
      const a = document.createElement("a");
      a.href = link.url;
      a.rel = "noopener";
      a.textContent = link.text;
      links.append(...(i ? [" · ", a] : [a]));
    });
    links.hidden = !links.childNodes.length;
    tips.addEventListener("toggle", () => { if (tips.open) tipsOpen.add(group.id); else tipsOpen.delete(group.id); });
    return tips;
  };

  const renderKits = () => {
    const checked = new Set(state.checked);
    const skipped = new Set(state.skipped);
    const typing = document.activeElement === addInput;
    ui.kits.replaceChildren(...shownKits().map((group) => {
      const isExtras = group.id === "extras";
      const { items } = group;
      const done = items.filter((i) => checked.has(i.id) || skipped.has(i.id)).length;
      const complete = items.length > 0 && done === items.length;
      // A kit that's all decided (packed or skipped) when the page opens starts
      // folded; tap its name to open it. One that finishes while you're packing
      // stays open (no folding under your finger), and so does one you open and
      // then undo. Extras never starts folded: its add row has to stay in reach.
      if (!wasComplete.has(group.id) && complete && !isExtras) folds.set(group.id, true);
      else if (wasComplete.get(group.id) && !complete) folds.delete(group.id);
      wasComplete.set(group.id, complete);
      const folded = folds.get(group.id) === true;

      const section = document.createElement("section");
      section.className = "pack-kit";
      section.classList.toggle("is-complete", complete);
      section.classList.toggle("is-new", glowing?.id === group.id); // a redraw mid-glow keeps it going
      section.dataset.packKitId = group.id;
      section.innerHTML = `
        <h3 class="pack-kit__title">
          <button class="pack-kit__head" type="button">
            <span class="pack-kit__tick" aria-hidden="true">✓</span>
            <span class="pack-kit__name"></span>
            <span class="pack-kit__count"></span>
            <svg class="pack-kit__caret" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </h3>
        <ul class="checklist pack-kit__list"></ul>`;
      const head = section.querySelector(".pack-kit__head");
      const count = section.querySelector(".pack-kit__count");
      section.querySelector(".pack-kit__name").textContent = group.name;
      count.textContent = `${done}/${items.length}`;
      count.hidden = items.length === 0; // an empty Extras has no 0/0
      head.setAttribute("aria-expanded", String(!folded));
      head.setAttribute("aria-label", items.length
        ? `${group.name}, ${done} of ${items.length} decided${complete ? ", all done" : ""}`
        : group.name);
      head.addEventListener("click", () => { folds.set(group.id, !folded); renderKits(); });

      const list = section.querySelector(".pack-kit__list");
      list.hidden = folded;
      // Always in the list's order: packed and skipped rows stay where they are.
      list.append(...group.items.map((item) => renderRow(item, checked, skipped)));
      if (isExtras) list.append(addRow);
      if (group.tips) section.append(renderTips(group, folded));
      return section;
    }));
    if (typing) addInput.focus({ preventScroll: true });
  };

  const renderProgress = () => {
    const { packed, skipped, total } = progress();
    const left = total - packed - skipped;
    const percent = total ? Math.round(((packed + skipped) / total) * 100) : 0;
    // "48 packed · 6 skipped · 12 to go", or All set when nothing's left.
    const parts = [`${packed} packed`, ...(skipped ? [`${skipped} skipped`] : []), `${left} to go`];
    ui.count.textContent = left ? parts.join(" · ") : "All set";
    ui.bar.setAttribute("aria-valuenow", String(percent));
    ui.bar.setAttribute("aria-valuetext", left ? parts.join(", ") : "All set");
    ui.barFill.style.width = `${percent}%`;
  };

  renderPage = () => {
    renderSetup();
    renderProgress();
    renderKits();
    // Keep the saved progress current (the kits can change under a saved trip),
    // and tell the header and the home page, which show it (packing-status.js).
    if (hasTrip) {
      state.progress = progress();
      const text = JSON.stringify(state);
      if (store.getText(STORAGE_KEY) !== text) store.setText(STORAGE_KEY, text);
    }
    document.dispatchEvent(new CustomEvent("hawkins:packing-progress"));
  };

  // ---------- Controls ----------
  // Start a new trip: the only thing that clears a trip. Undo brings it all back.
  const finishTrip = () => {
    const before = snapshot();
    state = blank();
    store.remove(STORAGE_KEY);
    hasTrip = false;
    HawkinsPage.replaceUrl(`${location.pathname}${location.hash}`);
    renderPage();
    toast("Trip cleared", restore(before));
  };

  // ---------- Share ----------
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

  const shareUrl = () => `${location.origin}${location.pathname}${tripQuery()}`;

  // What's left to pack, by kit, with amounts. Skipped items aren't going, so they're left out.
  const listText = () => {
    const done = new Set([...state.checked, ...state.skipped]);
    const lines = [`Packing list: ${summaryParts(state.days, state.kits).join(" · ")}`];
    shownKits().forEach((group) => {
      const rows = group.items.filter((i) => !done.has(i.id))
        .map((i) => `- ${i.item}${i.qty ? ` ×${i.qty}` : ""}${i.task ? " (to do)" : ""}`);
      if (rows.length) lines.push("", group.name.toUpperCase(), ...rows);
    });
    return lines.join("\n");
  };

  // Share the list (with a link to the trip), or just the link, so someone can
  // open the trip on their own phone. On a phone through its share sheet
  // (Messages, Notes...), elsewhere by copying.
  const share = async (what) => {
    const url = shareUrl();
    const text = what === "list" ? listText() : "";
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share(text ? { title: "Packing list", text, url } : { title: "Packing trip", url }); } catch (_) { /* cancelled */ }
      return;
    }
    const copied = await copyText(text ? `${text}\n\nThe trip: ${url}` : url);
    toast(!copied ? "Couldn't copy that" : text ? "Packing list and trip link copied" : "Trip link copied");
  };
  page.querySelectorAll("[data-pack-share]").forEach((button) => button.addEventListener("click", () => share(button.dataset.packShare)));

  // The Share menu opens toward whichever side has room, so on a phone it
  // never runs off the screen (the same menu as the shopping list's).
  const menu = { toggle: $("[data-pack-menu-toggle]"), list: $("[data-pack-menu]") };
  const showMenu = (open) => {
    menu.list.hidden = !open;
    menu.toggle.setAttribute("aria-expanded", String(open));
    if (!open) return;
    menu.list.classList.remove("is-start");
    if (menu.list.getBoundingClientRect().left < 8) menu.list.classList.add("is-start");
    menu.list.querySelector("button").focus();
  };
  menu.toggle.addEventListener("click", () => showMenu(menu.list.hidden));
  menu.list.addEventListener("click", (event) => { if (event.target.closest("button")) showMenu(false); });
  menu.list.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { showMenu(false); menu.toggle.focus(); }
  });
  HawkinsPage.on(document, "pointerdown", (event) => {
    if (!event.target.closest(".menu")) showMenu(false);
  });

  // ---------- Shared links ----------
  const parseShared = (params) => {
    const days = params.has("d") ? clampDays(params.get("d")) : DAYS_DEFAULT;
    const kits = (params.get("k") || "").split(",").filter((id) => tripIds.has(id));
    return { days, kits: ordered(kits) };
  };
  const sameTrip = (a, b) => a.days === b.days && a.kits.join() === b.kits.join();

  const params = new URLSearchParams(location.search);
  if (params.has("d") || params.has("k")) {
    const shared = parseShared(params);
    const use = () => {
      state = { ...state, days: shared.days, kits: shared.kits, checked: [], skipped: [] };
      save();
    };
    if (hasTrip && sameTrip(shared, state)) {
      syncUrl();
    } else if (!hasTrip || (state.checked.length === 0 && state.skipped.length === 0)) {
      use();
    } else {
      ui.shared.hidden = false;
      ui.shared.querySelector("[data-pack-shared-summary]").textContent = `(${summaryParts(shared.days, shared.kits).join(" · ")}).`;
      ui.shared.querySelector("[data-pack-shared-use]").addEventListener("click", () => {
        const before = snapshot();
        use();
        ui.shared.hidden = true;
        toast("Loaded the shared trip", restore(before));
      });
      ui.shared.querySelector("[data-pack-shared-keep]").addEventListener("click", () => {
        ui.shared.hidden = true;
        syncUrl();
      });
    }
  } else if (hasTrip) {
    syncUrl();
  }

  ui.main.hidden = false;
  renderPage();
})();
