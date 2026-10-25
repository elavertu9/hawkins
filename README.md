# Hawkins

Personal site for recipes, packing lists, and more, live at **https://starcourt.org**.

It's a [Jekyll](https://jekyllrb.com/) site. GitHub Pages builds and publishes it
automatically on every push to `main`. There is no build step to run yourself.

## Layout

| Path | What it is |
| --- | --- |
| `_recipes/` | One Markdown file per recipe. The data lives in the front matter. |
| `_layouts/recipe.html` | The template every recipe page uses, so they all look the same. |
| `_data/sections.yml` | Top-level sections (Recipes, Packing Lists, ...) for the nav and home page. |
| `_includes/` | Shared pieces: head, header, footer, recipe card, duration formatter. |
| `assets/css/main.css` | All styles, including colors and fonts as variables at the top. |
| `plan/index.html` | The meal plan page: pick recipes, get one shopping list sorted by aisle. |
| `assets/js/` | `recipe.js` for checklists, cook mode, and timers; `plan.js` for the meal plan and shopping list; `lights.js` for the home page lights; `upside-down.js` for the easter egg. |
| `assets/images/recipes/` | Recipe photos. |

## Add a recipe

1. Copy an existing file in `_recipes/`, for example `chicken-marsala.md`, and rename it.
   The file name becomes the URL: `_recipes/beef-stew.md` is served at `/recipes/beef-stew/`.
2. Fill in the front matter:

   ```yaml
   title: Beef Stew
   summary: One or two sentences shown on cards and at the top of the page.
   category: Dinner            # used for the filter on /recipes/
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

## Preview locally

```sh
./serve.sh
```

This needs Docker Desktop, and starts it if it isn't running. It builds the site the way
GitHub Pages does, opens http://localhost:4000, and reloads the page whenever you save a
file. Press Ctrl+C to stop. Pass a port to use a different one: `./serve.sh 4001`.

Opening `index.html` directly in a browser won't work. The pages are Jekyll templates
and have to be built first.
