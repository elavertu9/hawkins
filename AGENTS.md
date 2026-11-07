# AGENTS.md

Notes for AI coding agents working on Hawkins (https://starcourt.org). The README is the
reference for how each part works; this file is how to work on it without breaking things.

## The site

- A Jekyll site on GitHub Pages: pushing to `main` publishes it. There is no build step to run
  for production.
- Stranger Things look: dark background, red neon Libre Baskerville titles, Courier Prime labels,
  IBM Plex Sans body. Keep the design tokens in `_includes/css/tokens.css`.
- Audience: mostly the owner on an iPhone, plus friends and family who get links. Check every change
  at phone width (360–390px) as well as desktop, in both Light and Dark.
- Sections are "case files" in `_data/sections.yml`. Live sections are numbered first, in order
  (001 Recipes, 002 Packing, 003 Cocktails, 004 Caffeine), and the ones still coming get the
  higher numbers. Page eyebrows read `file:` from there, so renumbering is one edit.

## Commands

- `./serve.sh`: local preview at http://localhost:4000 (Docker, `ruby:3.3`, the github-pages gem).
- `tests/run.sh`: build in Docker, then run the browser tests in headless Chrome.
  `tests/run.sh plan cocktails` runs just those; `--no-build` reuses `_site/`. Run the full suite
  before saying something is done, and say plainly if anything fails.
- `./classified.sh`: re-lock the classified recipes (see below).
- `scripts/add-photo.sh <slug> <photo> [focus 0-100] ["alt text"]`: recipe and cocktail photos, 3:2.
- `scripts/add-drink-photo.sh <id> <photo> [focus] ["alt"]`: Caffeine drink photos, 4:5.

## Working with the owner

- Never commit or push unless asked in so many words. Building or fixing something isn't a request
  to push it. When asked, write a commit message in the style of `git log` (a summary line, then
  short bullets).
- Keep replies short. Show screenshots or measurements rather than describing a fix as working.
- Names are the owner's call (Stranger Things names for drinks, recipe titles): suggest, don't pick.
- No personal information on the site, ever (addresses, medications, contacts, locations).
- When something is ambiguous (which photo is which drink, which "header" is off-center), ask
  rather than guess. Point out when a photo doesn't match its description.

## Content

- New content is data rendered by a shared layout, never a hand-written page. Every entry in a
  section looks the same: one layout per type, the same image frame, a "Missing" placeholder when
  there's no photo.
- Recipes (`_recipes/`) and cocktails (`_cocktails/`) are Markdown files with front matter; the README
  has the fields. Write steps in your own words and credit the source. A step with 3+ actions is a
  bulleted list. Bold times (`**15 minutes**`) become timer buttons in cook mode.
- Recipe sites like Allrecipes block automated fetching: ask for a PDF, a screenshot, or pasted text.
- Cocktail menus list ingredients, not amounts: estimate them, and say they're estimates.
- Adding or removing a recipe changes counts the tests hard-code (`tests/plan.test.mjs` card count,
  `tests/tags.test.mjs` totals and tag lists). Update them in the same change.
- Two items in the meal plan can't share a file name: recipes and cocktails are both looked up by slug.
- YAML: quote any value with `: ` in it, and any flow-style item with a comma
  (`{ qty: "1", item: "orange peel, for the twist" }`).

## Photos

- Recipe and cocktail photos are 3:2 (the cards and pages are built for it). Caffeine drinks are 4:5.
- Phone photos are often stored sideways with a rotate tag, and HEIC metadata includes the camera,
  date, and sometimes location. The photo scripts convert through BMP first, which turns the pixels
  upright and drops all metadata. Use the scripts rather than hand-converting, then look at the
  result (especially the WebP copies) before committing.
- Never upscale. A small photo stays small; say so and ask for the original.
- Crop out people's faces.

## Classified recipes

- The readable copies in `_classified/` and the code in `.classified-code` are gitignored and must
  never be committed. The pre-commit hook (`scripts/hooks/pre-commit`) enforces it.
- Locked pages carry a copy of `_layouts/recipe.html` and every `_includes/*.html` (head, header,
  footer...). After changing any of those, run `./classified.sh` and commit the updated
  `_recipes/` files with the change, or the hook stops the commit.

## Code

- HTML in layouts, includes, and pages; CSS in `_includes/css/`; JavaScript in `assets/js/`. The only
  inline scripts are the three one-liners in `_includes/head.html` that set the theme, the Upside
  Down, and the classified stamp before the page draws. Keep it that way.
- CSS: `assets/css/main.css` only lists the pieces in `_includes/css/`, and Jekyll joins them in that
  order. Order is part of the behavior (an equal-specificity rule later in the file wins), so add a
  rule to the piece it belongs with. Don't move to Sass: GitHub Pages' old LibSass compiler breaks
  on CSS `min()`/`max()`.
- A media box with `aspect-ratio` can be stretched by its image unless it has `overflow: hidden` or
  `min-height: 0`. Check that a photo card and a "no photo" card are the same size.
- Turbo Drive swaps pages in place (see the top of `assets/js/page.js`). Scripts in `<head>` run once
  per visit; scripts in a page's `<body>` run again on each visit, after the swap. A script that
  must be ready the moment its page appears (like the recipe finder) loads from `<head>` and starts
  on `turbo:load`. Add window/document listeners through `HawkinsPage.on` so they're cleaned up.
- Header: the live sections in file order, then a thin line and the tools (Plan as an outlined pill,
  the cooking pot while cooking). On phones (below 58rem) the sections move into the Menu. The nav
  test checks the header fits on one line at every width; keep it passing when adding a section.
- The plan holds recipes and drinks, so buttons say "Add to plan", not "meal plan". A cocktail's
  `oz` is fluid ounces in the shopping list.
- Esc on a recipe or cocktail page goes back to the list in its breadcrumb (`page.js`). Anything else
  that uses Esc (dialogs, dropdowns) must keep working first.

## Tests

- Browser tests in `tests/*.test.mjs` drive headless Chrome over the DevTools protocol
  (`tests/lib.mjs`). Each file is one feature; add checks to the file for the feature you changed.
- Wait for state the page actually reaches (`until(...)`) instead of a fixed sleep: test files run
  four at a time, and anything timing-based will flake under load.
- A failure that only happens with other files running is usually timing or the local server, not
  the site. Reproduce it on its own (`JOBS=1 tests/run.sh --no-build name`) before changing site code.
- Screenshots land in `tests/.shots/` (gitignored). Look at them.

## Shell

- `rm` may be aliased to ask for confirmation, which hangs a non-interactive shell. Use `/bin/rm -f`.
- Don't `wait` in a shell that also started a background server; it waits for the server too.
