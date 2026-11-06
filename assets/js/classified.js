// Classified recipes. The page carries the recipe encrypted with the clearance
// code (AES-GCM, key from PBKDF2-SHA256; see scripts/classified.rb). The right code
// decrypts it here in the browser (HawkinsPage.clearance, in page.js), and the
// recipe takes the lock screen's place. A working code is remembered on this
// device so other classified files open on their own, and they can go in the
// meal plan; "Lock" forgets it.
(() => {
  const lock = document.querySelector("[data-classified]");
  if (!lock) return;

  const form = lock.querySelector("[data-classified-form]");
  const input = lock.querySelector("[data-classified-input]");
  const submit = lock.querySelector("[data-classified-submit]");
  const error = lock.querySelector("[data-classified-error]");
  const cipher = JSON.parse(lock.querySelector("[data-classified-cipher]").textContent);

  const { clearance } = HawkinsPage;

  const open = (html) => {
    const template = document.createElement("template");
    template.innerHTML = html;

    // A note at the top, with a way to lock classified files on this device again.
    const bar = document.createElement("p");
    bar.className = "classified__bar";
    bar.innerHTML = '<span>Clearance granted · Classified file</span> <button type="button">Lock</button>';
    bar.querySelector("button").addEventListener("click", () => { clearance.forget(); location.reload(); });

    // Its + Add to meal plan button: plan.js shows it once the recipe is open.
    template.content.querySelectorAll("[data-plan-add]").forEach((b) => { b.dataset.planClassified = ""; });
    lock.replaceWith(bar, template.content);
    document.dispatchEvent(new CustomEvent("hawkins:classified-open"));

    // Now that the recipe is on the page, start its checklists, then cook mode
    // and timers (cook.js builds on recipe.js, so keep them in order).
    const base = document.querySelector('script[src*="classified.js"]').src;
    ["recipe.js", "cook.js"].forEach((name) => {
      const script = document.createElement("script");
      script.src = base.replace("classified.js", name);
      script.async = false;
      document.body.append(script);
    });
  };

  const tryCode = async (code, fromForm) => {
    try {
      const html = await clearance.decrypt(cipher, code);
      clearance.remember(code);
      open(html);
      return true;
    } catch (_) {
      if (fromForm) {
        error.textContent = "Access denied. Clearance code not recognized.";
        form.classList.remove("is-denied");
        void form.offsetWidth; // restart the shake
        form.classList.add("is-denied");
        input.select();
      } else {
        clearance.forget(); // the code changed since this device saved it
      }
      return false;
    }
  };

  if (!window.crypto || !crypto.subtle) {
    // Web Crypto only works on https (or localhost).
    error.textContent = "This browser can't open classified files here. Try the https:// address.";
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Checking…";
    const ok = await tryCode(input.value, true);
    if (!ok) {
      submit.disabled = false;
      submit.textContent = "Open file";
    }
  });

  (async () => {
    const saved = clearance.code();
    if (saved && await tryCode(saved, false)) return;
    form.hidden = false;
    input.focus({ preventScroll: true });
  })();
})();
