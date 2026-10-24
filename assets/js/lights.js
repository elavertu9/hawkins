// Joyce's alphabet wall: spells the message in [data-lights] one bulb at a time.
(() => {
  const wall = document.querySelector("[data-lights]");
  if (!wall) return;

  const message = (wall.dataset.lights || "").toUpperCase();
  const colors = ["#ff3b3b", "#ffd23b", "#3bff6b", "#3bb8ff", "#ff7b3b", "#d33bff"];

  const bulbs = [];
  [...message].forEach((char, i) => {
    const el = document.createElement("span");
    if (char === " ") {
      el.className = "bulb--space";
    } else {
      el.className = "bulb";
      el.style.setProperty("--c", colors[i % colors.length]);
      el.innerHTML = `<span class="bulb__glass"></span><span class="bulb__letter">${char}</span>`;
      bulbs.push(el);
    }
    wall.appendChild(el);
  });

  const setAll = (on) => bulbs.forEach((b) => b.classList.toggle("is-on", on));

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setAll(true);
    return;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  (async function spell() {
    await wait(600);
    for (;;) {
      for (const bulb of bulbs) {
        bulb.classList.add("is-on");
        await wait(480);
        bulb.classList.remove("is-on");
        await wait(140);
      }
      setAll(true);
      await wait(3200);
      setAll(false);
      await wait(1200);
    }
  })();
})();
