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
| `_includes/` | Shared pieces: head, header, footer, recipe card, duration formatter. |
| `assets/css/main.css` | All styles, including colors and fonts as variables at the top. |
| `plan/index.html` | The meal plan page: pick recipes, get one shopping list sorted by aisle. |
| `assets/js/` | `recipe.js` for checklists and cook mode; `timers.js` for kitchen timers, which follow you to every page; `plan.js` for the meal plan and shopping list; `lights.js` for the home page lights; `upside-down.js` for the easter egg; `page.js` and `lib/turbo.js` for in-place page changes (see below). |
| `assets/images/recipes/` | Recipe photos. |
| `tests/` | Browser tests for the site's features. `tests/run.sh` runs them. |

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
   notes:                      # optional
     - Anything worth remembering.
   ```

3. Commit and push. The site updates in a minute or two.

Total time is calculated from `prep + cook + additional`.

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
  the same name to `_recipes/`, which is safe to commit.
- To change the code, edit `.classified-code` and run `./classified.sh`. Anyone who
  saved the old code is asked for the new one.
- Classified recipes show on the recipes page with a "Classified" stamp over
  the image (an `image:` in the readable copy carries over) and stay out of
  the meal plan.
- Unlocking needs `https://` (or `localhost`); it won't work over a plain
  `http://` LAN address.

## Photos

Put a photo in `assets/images/recipes/` and set `image:` in the recipe. Any size or
shape works: every recipe image is cropped to the same 3:2 frame on cards and recipe
pages. Around 1200×800 is plenty. Recipes without an `image:` show the "Missing"
placeholder.

## Add a new section (e.g. packing lists)

1. In `_data/sections.yml`, the `packing` entry is already there with `status: soon`.
   That shows it on the home page as "Coming soon".
2. When it's ready, add a `packing` collection in `_config.yml` the same way
   `recipes` is set up, create `_packing/` with items and a `packing/index.html`
   listing page, and add a layout for packing items.
3. Change its status to `live`. It then appears in the header nav and links from the home page.

## Scripts and page changes (Turbo)

Links swap pages in place with [Turbo Drive](https://turbo.hotwired.dev/handbook/drive)
(`assets/js/lib/turbo.js`, version 8.0.12), so the browser tab stays loaded as you
move around. That's what keeps timers beeping and the screen awake from page to page.

- Scripts in `<head>` (`_includes/head.html`) run once per visit to the site. Scripts in
  a page's body run again every time that page is shown, with the same `window` and
  `document` as before.
- So in a body script, add `window` or `document` listeners with
  `HawkinsPage.on(target, type, fn)`, and register other cleanup with
  `HawkinsPage.onLeave(fn)`. Both are undone before the next page renders (`page.js`).
- Don't call `history.replaceState(null, ...)`: pass `history.state` instead, or Back
  breaks. Use `HawkinsPage.visit(url)` to go somewhere from code.
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
- Screenshots of each run land in `tests/.shots/` (gitignored).
- The classified test reads the code from `.classified-code` and the readable copies from
  `_classified/`, and skips itself on a machine that doesn't have them.

Run it before pushing a change to how the site looks or works.
