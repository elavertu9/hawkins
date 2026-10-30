// How far along your packing is, on the pages that aren't the packing list.
// packing.js saves it with the trip (`progress: { packed, skipped, total }`),
// because only /packing/ has the kit data to count it. It shows in two places:
//
//   - The header: a percentage on the Packing link ("72%"), the share of the
//     list that's decided (packed or skipped).
//   - "Pick up where you left off" on the home page ([data-packing-resume]):
//     the trip and "48 of 66 decided", linking back to /packing/.
//
// Both stay hidden when there's no saved trip, and once everything is decided.
//
// This script runs once per visit (like cooking.js); the header and the page
// are new on every page, so it fills them in again on each.
(() => {
  const { store } = HawkinsPage;
  const KEY = "hawkins:packing";

  const number = (n) => (Number.isFinite(n) && n >= 0 ? n : null);

  // The saved trip's progress, or null: no trip, nothing counted yet, or done.
  const status = () => {
    const saved = store.get(KEY);
    const p = saved && typeof saved === "object" ? saved.progress : null;
    if (!p || typeof p !== "object") return null;
    const packed = number(p.packed);
    const skipped = number(p.skipped);
    const total = number(p.total);
    if (packed === null || skipped === null || !total) return null;
    const decided = Math.min(total, packed + skipped);
    if (decided >= total) return null;
    // Rounding must not call 665 of 666 "100%".
    return { saved, decided, total, percent: Math.min(99, Math.round((decided / total) * 100)) };
  };

  // "5 days · Flying · Beach / Pool", as the packing page says it. The kit
  // names come from the home page (the same data the packing page is built from).
  const tripName = (saved, names) => {
    const days = Math.round(Number(saved.days)) || 0;
    const kits = (Array.isArray(saved.kits) ? saved.kits : []).filter((id) => typeof names[id] === "string");
    return [`${days} day${days === 1 ? "" : "s"}`, ...kits.map((id) => names[id])].join(" · ");
  };

  const BAG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 7h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM9 7v12M15 7v12"/></svg>';

  const render = () => {
    const now = status();

    // Header: the percent decided, next to "Packing".
    const badge = document.querySelector("[data-packing-count]");
    if (badge) {
      badge.hidden = !now;
      if (now) badge.textContent = `${now.percent}%`;
      const link = badge.closest("a");
      if (now) link.setAttribute("aria-label", `Packing, ${now.percent}% decided`);
      else link.removeAttribute("aria-label");
    }

    // Pick up where you left off.
    document.querySelectorAll("[data-packing-resume]").forEach((section) => {
      section.hidden = !now;
      if (!now) return;
      let names = {};
      try { names = JSON.parse(section.querySelector("[data-packing-names]").textContent); } catch (_) { /* no names */ }
      const row = section.querySelector(".cooking-row");
      row.querySelector(".cooking-row__art").innerHTML = BAG;
      row.querySelector(".cooking-row__title").textContent = `Packing: ${tripName(now.saved, names)}`;
      row.querySelector(".cooking-row__meta").textContent = `${now.decided} of ${now.total} decided`;
    });
  };

  // ---------- When to render ----------
  document.addEventListener("turbo:load", render);
  document.addEventListener("hawkins:packing-progress", render); // packing.js saved
  addEventListener("storage", (event) => { if (!event.key || event.key === KEY) render(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
