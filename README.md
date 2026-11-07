# Hawkins

Personal site for recipes, packing lists, and more, live at **https://starcourt.org**.

It's a [Jekyll](https://jekyllrb.com/) site. GitHub Pages builds and publishes it
automatically on every push to `main`. There is no build step to run yourself.

## Layout

| Path | What it is |
| --- | --- |
| `_recipes/` | One Markdown file per recipe. The data lives in the front matter. |
| `_classified/` | Classified recipes, readable and gitignored. `./classified.sh` encrypts them into `_recipes/`. |
| `_layouts/recipe.html` | The template every recipe page uses, so they all look the same. |
| `_data/sections.yml` | Top-level sections (Recipes, Packing Lists, ...) for the nav and home page. |
| `_includes/` | Shared pieces: head, header, footer, recipe card, recipe image, ingredient list, duration formatter. |
| `assets/css/main.css` | All styles, including colors and fonts as variables at the top. |
| `plan/index.html` | The meal plan page: pick recipes, get one shopping list sorted by aisle. |
| `_data/packing.yml` | The packing lists: kits and their items, and the preset trips. See "Packing lists" below. |
| `packing/index.html` | The packing page: trip setup and the checklist. |
| `_data/drinks.yml` | The Caffeine drinks and the shops' names for things. See "Caffeine" below. |
| `caffeine/index.html` | The Caffeine page: a card per drink, made entirely by Liquid. |
| `_cocktails/` | One Markdown file per cocktail, data in the front matter, like recipes. See "Cocktails" below. |
| `_layouts/cocktail.html` | The page every cocktail uses: the recipe page's hero, ingredients, and steps, without cook mode. |
| `cocktails/index.html` | The Cocktails list: the Upside Bar banner and a card per cocktail (`_includes/cocktail-card.html`). |
| `assets/js/` | `nav.js` for the phone Menu button in the header (every page); `recipe.js` for checklists and Keep screen on; `cook.js` for cook mode; `timers.js` for kitchen timers, which follow you to every page; `plan.js` for the meal plan and shopping list; `packing.js` for the packing lists (only loaded on `/packing/`); `packing-status.js` for the Packing badge in the header and the trip on the home page (every page); `lights.js` for the home page lights; `st-day.js` for the Stranger Things Day card on the home page and `recipes.js` for the search and filters on `/recipes/` (both every page, so they're ready when those pages swap in); `upside-down.js` for the easter egg; `page.js` (page changes, plus shared storage and screen-on helpers) and `lib/turbo.min.js` for in-place page changes (see below). |
| `assets/images/recipes/` | Recipe photos. |
| `assets/images/drinks/` | Drink photos (4:5). |
| `assets/images/cocktails/` | Cocktail photos (3:2) and the Cocktails banner (`upside-bar`). |
| `tests/` | Browser tests for the site's features. `tests/run.sh` runs them. |
| `scripts/` | Tools: `add-photo.sh` for recipe photos, `add-drink-photo.sh` for drink photos, `classified.rb` (run by `./classified.sh`), and `hooks/pre-commit`. |
| `.github/workflows/test.yml` | Runs the checks and tests on GitHub after every push. |

## Add a recipe

1. Copy an existing file in `_recipes/`, for example `chicken-marsala.md`, and rename it.
   The file name becomes the URL: `_recipes/beef-stew.md` is served at `/recipes/beef-stew/`.
2. Fill in the front matter:

   ```yaml
   title: Beef Stew
   summary: One or two sentences shown on cards and at the top of the page.
   category: Dinner            # used for the filter on /recipes/
   tags: [Low Calorie]         # optional, any number; each gets its own filter chip
   added: 2026-10-26           # the day you add it; drives "Newest" and the home page
   image: /assets/images/recipes/beef-stew.jpg   # optional
   image_alt: Bowl of beef stew                  # optional
   time:
     prep: 20                  # minutes
     cook: 120
     additional: 0             # optional, shown as "Rest"
   servings: 6
   calories: 420               # per serving, from the source
   calories_estimated: true    # only if you estimated it; shows "~420 EST."
   yield: 1 large pot          # optional
   source:                     # optional
     name: Allrecipes
     author: Someone
     url: https://...
   ingredients:
     - group: Stew             # optional heading
       items:
         - qty: "2 pounds"
           item: beef chuck, cubed
         - qty: ""
           item: salt and freshly ground black pepper, to taste
           shop: [salt, black pepper]   # optional, see below
   steps:
     - title: Brown the beef
       text: Use **bold** for temperatures and times so they stand out.
     - title: Start the potatoes   # 3+ separate actions: one bullet each
       text: |-
         - Cover the potatoes with cold water and add **1 teaspoon** salt.
         - Bring to a boil over **high heat**.
         - Simmer **15–20 minutes**, until a fork slides in easily.
   notes:                      # optional
     - Anything worth remembering.
   ```

3. Commit and push. The site updates in a minute or two.

Total time is calculated from `prep + cook + additional`.

**Steps.** Write a step as a paragraph, unless it has 3 or more separate actions;
then make each action a bullet (`text: |-`, one `- ` line per action), so it's
easy to keep your place in cook mode. A bold time becomes a timer button in cook
mode. A range (`**15–20 minutes**`) rings at 15, with a +5 min button to run it on
to 20.

**Shopping names (optional).** The meal plan works out what to buy from each
ingredient's text ("garlic, minced" becomes "garlic"). When it gets one wrong,
add `shop:` with the name to buy, or a list for a line with several things
(the amount goes with the first name). `shop_aisle:` overrides the store aisle,
using one of the aisle names in `assets/js/plan.js`, such as `Produce`.

```yaml
- qty: "1 cup"
  item: sour milk or buttermilk
  shop: milk                 # merges with the other milk on the list
```

## Classified recipes

Some recipes are only for people with the code. They're encrypted, so neither
the site nor this (public) repo shows them without it.

- The readable recipe lives in `_classified/` (same format as `_recipes/`). That
  folder is gitignored, so it never reaches GitHub. **Keep a backup of it.**
- The code lives in `.classified-code` (one line, also gitignored). Case and extra
  spaces don't matter. Use a phrase, not a short number.
- After adding or editing one, run `./classified.sh`. It writes a locked page with
  the same name to `_recipes/`, which is safe to commit. Run it again after changing
  `_layouts/recipe.html` or anything in `_includes/`, since the locked pages carry
  the recipe's markup.
- A pre-commit hook (`scripts/hooks/pre-commit`) stops a commit that includes
  `_classified/`, `.classified-code`, or the code itself, or whose locked pages are
  out of date with the layout. Turn it on once per clone:
  `git config core.hooksPath scripts/hooks`. GitHub runs the same check.
- To change the code, edit `.classified-code` and run `./classified.sh`. Anyone who
  saved the old code is asked for the new one.
- Classified recipes show on the recipes page with a "Classified" stamp over
  the image (an `image:` in the readable copy carries over).
- They can go in the meal plan only on a device that has the code: their
  + Plan buttons and their place in the plan's Add a recipe list appear once
  it's entered. `./classified.sh` also locks their servings and ingredients
  into `_data/classified_plan.yml` for the plan page (safe to commit). Lock
  takes them back out of the plan.
- Unlocking needs `https://` (or `localhost`); it won't work over a plain
  `http://` LAN address.

## Photos

```sh
scripts/add-photo.sh banana-bread ~/Downloads/IMG_1234.HEIC 70 "Loaf of banana bread in a pan"
```

That's the recipe's file name, the photo (straight from a phone is fine), where to
crop (0-100: for a tall photo 0 keeps the top and 100 the bottom; default 50), and
alt text (optional if the recipe has one). It crops to the site's 3:2 frame, saves a
JPG plus smaller WebP copies in `assets/images/recipes/` so phones download far less,
and sets `image:` and `image_alt:` in the recipe. If the crop is off, run it again
with a different number. It needs macOS and `brew install webp`.

Photos get a light grade and vignette in the stylesheet (`.is-photo` in `main.css`)
so they sit in the dark theme. Recipes without an `image:` show the "Missing"
placeholder.

## Packing lists

Everything is in `_data/packing.yml`: edit it and the page follows. It has `kits:`
(core kits are always on; the rest are trip kits you toggle) and `presets:` (links
like `/packing/?d=7&k=flying,warm,swim`). The file's header comment lists the item fields:

- `qty: { per_day, plus, per_week, max }` shows "x5" next to the item: `min(max, max(1, ceil(days * per_day) + plus + per_week * floor(days / 7)))`.
  Underwear and socks are a pair a day, one spare, and one more spare a week. `{ plus: 2 }` alone is a fixed 2 (Extra socks).
- `task: true` makes it a to-do, not a thing to pack.
- `when: "cold+dressy"` shows it only when all of those kits are on.
- An item can be in several kits with the same `id` (sunscreen); it shows once, under the first kit that's on.
- A kit can have `tips: { title, items, links }`: a short note, folded under its list (Flying has the TSA rules).
- Each trip kit has a `group:` (Getting there, Weather, Plans): the heading its button sits under in the setup.

The trip is saved in the browser under `hawkins:packing` and never expires; "Clear trip"
(next to Share) clears it, after an "are you sure?" box, with Undo. Each
item is to pack, packed, or skipped ("not taking it"), so the saved trip has `checked` and `skipped` (an item is in at most one), `extras`
(your own items, the Extras kit at the end), and `setupFolded` (the setup stays open until
you tap Hide). `packing.js` also saves `progress: { packed, skipped, total }` each time it
draws the list; `packing-status.js` shows it on other pages as a percentage on the Packing
link and as "Pick up where you left off" on the home page, until everything is decided.

## Caffeine

Our favorite energy drink combos from Dutch Bros and Aroma Joe's, at `/caffeine/`. Everything is in
`_data/drinks.yml` (its header comment lists the fields): edit it and the page follows. A drink is:

- `id` (the card's link, `/caffeine/#hawkins`), `name` (its Hawkins name), `flavors`, and `style` (`iced` or `blended`).
- `sugar_free: true` (optional) adds "Sugar-free" to the style line.
- `top: true` (optional) means "has been good with a foam top". Each shop's row adds "Also good with a Soft Top"
  (or Cloud Top, in that shop's word). It's never part of the drink.
- `shop_notes` (optional): a tip for one shop, shown under that shop's order line, e.g. `{ dutch-bros: Sour shots make it sweeter. }`.
- `shop_names` (optional): a shop's own menu name for it, by shop id, e.g. `{ dutch-bros: Galaxy Fish }`.
- `photo` and `photo_alt` (optional). Without a photo the card shows a "Missing" placeholder.

The two chains call the same things differently, so `shops:` is a small translation list: each
shop has an `id`, a `name`, its energy drink `base` (Rebel at Dutch Bros, Rush at Aroma Joe's) and
its foam `top` (Soft Top, Cloud Top). Each card has an order line per shop, in `shops` order:

- If the drink has a `shop_names` entry for that shop, the line is that name in curly quotes: "Galaxy Fish".
- Otherwise it's built from the shop's base and the flavors: "Rush with passion fruit, strawberry, lime".

Photos are 4:5 (tall, like a cup). Make them with the script, then paste the two lines it prints into
the drink:

```sh
scripts/add-drink-photo.sh hawkins ~/Downloads/IMG_1234.HEIC 40 "Deep red iced drink in a cup"
```

That's the drink's id, the photo (straight from a phone is fine), where to crop (0-100, as for recipe
photos) and alt text. It saves a JPG and WebP copies in `assets/images/drinks/`, with all metadata
(location, camera) stripped. It needs macOS and `brew install webp`.

## Cocktails

Cocktails we've had out, written up to make at home. The list is at `/cocktails/` and each one has its
own page, like a recipe but smaller (no cook mode or servings). One file per cocktail in
`_cocktails/`, and the file name is the URL: `_cocktails/demogorgon.md` is `/cocktails/demogorgon/`.
The menus they came from don't give amounts, so the amounts are estimates.

```yaml
title: Demogorgon
spirit: Bourbon                 # the eyebrow on the card, and a box on the page
summary: One line, shown on the card and under the title.
glass: Rocks glass              # short: it's a box beside Spirit and Makes
from: "The Upside Bar at Stranger Things: The Experience"   # optional: "From ..." under the steps
image: /assets/images/cocktails/demogorgon.jpg              # optional, 3:2 like a recipe's
image_alt: Amber old fashioned with a stroopwafel on top
ingredients:
  - { qty: "2 oz", item: "bourbon, such as WhistlePig" }   # quote an item with a comma
steps:
  - Shake hard with ice until the shaker is frosty, about **15 seconds**.
```

**Planning drinks.** + Plan on a cocktail's card or page puts it in the meal plan, under its own
Drinks heading below the recipes, as "Makes 1" (up to 4, never half). Its ingredients join the
shopping list: a cocktail's "oz" is fluid ounces, so 2 drinks' bourbon reads "4 oz", never pounds.
Liquor, bitters, grenadine, and mixers sort into Drinks & Alcohol. For anything else, `shop:` and
`shop_aisle:` work as they do in a recipe (`{ qty: "1", item: orange slice, shop: orange }`). A
cocktail's file name can't match a recipe's, since the plan knows both by name.

Photos work like recipe photos: 3:2, made by the same script, which saves them in
`assets/images/cocktails/` and sets `image:` and `image_alt:` for you. Without one, the card shows a
cocktail-glass tile and the page shows "Missing" ("Have you seen this drink?"), a short strip on
phones. The Upside Bar banner at the top of the list is `assets/images/cocktails/upside-bar`.

```sh
scripts/add-photo.sh black-cherry-mule ~/Downloads/IMG_1234.HEIC 50 "Black cherry mule in a copper mug"
```

## Add a new section (e.g. a watchlist)

1. In `_data/sections.yml`, the section's entry is already there with `status: soon`.
   That shows it on the home page as "Coming soon".
2. When it's ready, create its page (like `plan/index.html` and `packing/index.html`), or
   add a collection in `_config.yml` the same way `recipes` is set up, with a layout for its items.
3. Change its status to `live`. It then appears in the header nav and links from the home page.
   If the title is long, add `nav:` with a shorter name for the header (Packing Lists shows as "Packing").
   On phones the header has no room for the section links, so they move into a Menu button's
   dropdown (`nav.js`); it lists the same live sections, in the same order.
   The header lists the sections first, in file order, then the tools after a thin line: Plan
   (an outlined pill, since recipes and drinks both use it) and the cooking pot while you're cooking.
   Give a new live section the next file number, and move the "soon" ones up past it.

## Scripts and page changes (Turbo)

Links swap pages in place with [Turbo Drive](https://turbo.hotwired.dev/handbook/drive)
(`assets/js/lib/turbo.min.js`, version 8.0.12, minified from the official build), so the browser tab stays loaded as you
move around. That's what keeps timers beeping and the screen awake from page to page.

- Scripts in `<head>` (`_includes/head.html`) run once per visit to the site. Scripts in
  a page's body run again every time that page is shown, with the same `window` and
  `document` as before.
- So in a body script, add `window` or `document` listeners with
  `HawkinsPage.on(target, type, fn)`, and register other cleanup with
  `HawkinsPage.onLeave(fn)`. Both are undone before the next page renders (`page.js`).
- Don't call `history.replaceState(null, ...)`: pass `history.state` instead, or Back
  breaks. Use `HawkinsPage.visit(url)` to go somewhere from code.
- Save things with `HawkinsPage.store` (or `.session`) rather than `localStorage`
  directly; it never throws when storage is blocked. Keep the screen on with
  `HawkinsPage.wake.set(name, true)`. An inline `<script>` runs before `page.js`
  on a full page load, so check `window.HawkinsPage` there first.
- To make a link do a normal full page load, add `data-turbo="false"` to it.
- `tests/turbo.test.mjs` checks moving around the site this way.

## Preview locally

```sh
./serve.sh
```

This needs Docker Desktop, and starts it if it isn't running. It builds the site the way
GitHub Pages does, opens http://localhost:4000, and reloads the page whenever you save a
file. Press Ctrl+C to stop. Pass a port to use a different one: `./serve.sh 4001`.

Opening `index.html` directly in a browser won't work. The pages are Jekyll templates
and have to be built first.

## Run the tests

```sh
tests/run.sh
```

This builds the site, serves it, and checks every feature in headless Chrome: search,
filters, sorting, cook mode, the meal plan, classified recipes, and the layout on desktop
and phone. It needs Docker, Node 22 or newer, and Google Chrome.

- `tests/run.sh plan cook` runs only those tests (the names match `tests/*.test.mjs`).
- `tests/run.sh --no-build` skips the build and tests the current `_site/`.
- Test files run four at a time; `JOBS=1 tests/run.sh` runs them one by one, which
  helps when reading a failure.
- `recipes` checks every recipe page: title, ingredients, steps, photos that load,
  alt text, and the structured data search engines read. It catches front matter
  typos in a new recipe.
- Screenshots of each run land in `tests/.shots/` (gitignored).
- The classified test reads the code from `.classified-code` and the readable copies from
  `_classified/`, and skips itself on a machine that doesn't have them.

Run it before pushing a change to how the site looks or works. GitHub also runs it
after every push (the Actions tab, or the check mark next to a commit); without the
clearance code there, the classified tests skip themselves.
