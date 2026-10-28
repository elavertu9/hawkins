// Classified recipes. The page carries the recipe encrypted with the clearance
// code (AES-GCM, key from PBKDF2-SHA256; see scripts/classified.rb). The right code
// decrypts it here in the browser, and the recipe takes the lock screen's place.
// A working code is remembered on this device so other classified files open on
// their own; "Lock" forgets it.
(() => {
  const lock = document.querySelector("[data-classified]");
  if (!lock) return;

  const STORAGE_KEY = "hawkins:clearance-code";
  const form = lock.querySelector("[data-classified-form]");
  const input = lock.querySelector("[data-classified-input]");
  const submit = lock.querySelector("[data-classified-submit]");
  const error = lock.querySelector("[data-classified-error]");
  const cipher = JSON.parse(lock.querySelector("[data-classified-cipher]").textContent);

  // Codes ignore case and extra spaces, so "Friends  Don't Lie" works too.
  // Must match normalize in scripts/classified.rb.
  const normalize = (code) => code.trim().replace(/\s+/g, " ").toLowerCase();

  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const decrypt = async (code) => {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalize(code)), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: bytes(cipher.salt), iterations: cipher.iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(cipher.iv) }, key, bytes(cipher.data));
    return new TextDecoder().decode(plain);
  };

  const remembered = () => HawkinsPage.store.getText(STORAGE_KEY);
  const remember = (code) => HawkinsPage.store.setText(STORAGE_KEY, code);
  const forget = () => HawkinsPage.store.remove(STORAGE_KEY);

  const open = (html) => {
    const template = document.createElement("template");
    template.innerHTML = html;

    // A note at the top, with a way to lock classified files on this device again.
    const bar = document.createElement("p");
    bar.className = "classified__bar";
    bar.innerHTML = '<span>Clearance granted · Classified file</span> <button type="button">Lock</button>';
    bar.querySelector("button").addEventListener("click", () => { forget(); location.reload(); });

    lock.replaceWith(bar, template.content);

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
      const html = await decrypt(code);
      remember(code);
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
        forget(); // the code changed since this device saved it
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
    const saved = remembered();
    if (saved && await tryCode(saved, false)) return;
    form.hidden = false;
    input.focus({ preventScroll: true });
  })();
})();
