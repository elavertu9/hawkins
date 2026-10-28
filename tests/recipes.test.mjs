// Every recipe page: the basics are filled in, its photos load, and its
// structured data (what search engines read) matches the page. Catches typos
// in a new recipe's front matter before it goes live.
import { open } from "./lib.mjs";

const { ev, go, check, errors, finish } = await open();
await go("/recipes/");

const problems = await ev(`(async () => {
  const problems = [];
  const parse = (html) => new DOMParser().parseFromString(html, "text/html");
  const ok = async (url) => (await fetch(url, { method: "HEAD" })).ok;
  const cards = [...document.querySelectorAll(".card")];
  const urls = [...new Set(cards.map((c) => c.querySelector(".card__link").getAttribute("href")))];
  if (urls.length !== cards.length) problems.push("two cards link to the same recipe");

  // Card images (and their smaller copies) load.
  for (const card of cards) {
    const name = card.querySelector(".card__link").getAttribute("href");
    for (const url of imageUrls(card)) if (!(await ok(url))) problems.push(name + ": card image missing: " + url);
  }

  for (const url of urls) {
    const page = parse(await (await fetch(url)).text());
    const say = (text) => problems.push(url + ": " + text);
    const title = page.querySelector("h1")?.textContent.trim();
    if (!title) say("no title");
    for (const src of imageUrls(page.querySelector(".recipe-hero__media"))) if (!(await ok(src))) say("image missing: " + src);
    const photo = page.querySelector(".recipe-hero__media.is-photo img");
    if (photo && !photo.alt.trim()) say("photo has no alt text");

    if (page.querySelector("[data-classified]")) continue; // the rest is encrypted
    if (!page.querySelector(".recipe-hero .eyebrow")?.textContent.trim()) say("no category");

    const ingredients = page.querySelectorAll(".ingredients .checklist input").length;
    const steps = page.querySelectorAll(".step").length;
    if (!ingredients) say("no ingredients");
    if (!steps) say("no steps");
    page.querySelectorAll(".check__text").forEach((el) => { if (!el.textContent.trim()) say("blank ingredient"); });
    page.querySelectorAll(".step__text").forEach((el, i) => { if (!el.textContent.trim()) say("step " + (i + 1) + " is blank"); });

    let data;
    try { data = JSON.parse(page.querySelector('script[type="application/ld+json"]').textContent); }
    catch (e) { say("structured data doesn't parse: " + e.message); continue; }
    if (data.name !== title) say("structured data name '" + data.name + "' vs title '" + title + "'");
    if ((data.recipeIngredient || []).length !== ingredients) say("structured data has " + (data.recipeIngredient || []).length + " ingredients, page has " + ingredients);
    if ((data.recipeInstructions || []).length !== steps) say("structured data has " + (data.recipeInstructions || []).length + " steps, page has " + steps);
    if (!/^PT[1-9]\\d*M$/.test(data.totalTime)) say("total time is " + data.totalTime + " (missing time: in front matter?)");
    if (!data.description) say("no summary");
    if (/servings$/.test(data.recipeYield) && !/^\\d/.test(data.recipeYield)) say("servings missing: " + data.recipeYield);
    if (data.isBasedOn && !/^https?:\\/\\//.test(data.isBasedOn)) say("source url isn't a link: " + data.isBasedOn);
  }
  return problems;

  function imageUrls(root) {
    if (!root) return [];
    const urls = [...root.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    root.querySelectorAll("source").forEach((s) => s.srcset.split(",").forEach((part) => urls.push(part.trim().split(" ")[0])));
    return urls.filter(Boolean);
  }
})()`);

check(`recipe pages: ${problems.length ? problems.join("\n  ") : "no problems"}`, problems.length === 0);
check(`JS errors: ${errors.length} ${errors.join(" | ")}`, errors.length === 0);
finish();
