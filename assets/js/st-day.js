// Stranger Things Day: November 6, the night Will vanished in 1983. On the
// visitor's own Nov 6 the home page shows its card (index.html); ?st-day
// previews it any day. Loaded once, in <head>, so the card is there as soon
// as the home page is.
(() => {
  const show = () => {
    const card = document.querySelector("[data-st-day]");
    if (!card) return;
    const d = new Date();
    if ((d.getMonth() === 10 && d.getDate() === 6) || new URLSearchParams(location.search).has("st-day")) card.hidden = false;
  };
  document.addEventListener("turbo:load", show);
  document.addEventListener("DOMContentLoaded", show); // in case Turbo isn't running
})();
