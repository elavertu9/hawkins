#!/bin/bash
# Add a photo to a recipe: crops it to the site's 3:2 frame, saves a JPG plus
# smaller WebP copies for phones (assets/images/recipes/), and sets image: and
# image_alt: in the recipe.
#
# Usage: scripts/add-photo.sh <recipe> <photo> [focus] ["alt text"]
#
#   recipe   the recipe's file name without .md, e.g. banana-bread
#   photo    any image file (from a phone is fine; HEIC, PNG, and JPG all work)
#   focus    which part to keep when cropping, 0-100 (default 50, the middle).
#            For a tall photo, 0 keeps the top and 100 the bottom; for a wide
#            one, 0 keeps the left and 100 the right.
#   alt      a short description for screen readers. Optional if the recipe
#            already has one.
#
# Classified recipes work too: it updates _classified/<recipe>.md, and you run
# ./classified.sh afterwards.
#
# Needs macOS (sips) and cwebp (brew install webp).

set -euo pipefail

SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$SITE_DIR/assets/images/recipes"
MAX_WIDTH=1200
SMALL_WIDTHS=(480 800)

if [ $# -lt 2 ]; then
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi
slug="$1"
photo="$2"
focus="${3:-50}"
alt="${4:-}"

command -v sips >/dev/null || { echo "This needs macOS (sips)." >&2; exit 1; }
command -v cwebp >/dev/null || { echo "This needs cwebp: brew install webp" >&2; exit 1; }
[ -f "$photo" ] || { echo "No photo at $photo." >&2; exit 1; }
[[ "$focus" =~ ^[0-9]+$ ]] && [ "$focus" -le 100 ] || { echo "focus must be 0-100." >&2; exit 1; }

recipe="$SITE_DIR/_recipes/$slug.md"
classified=0
if [ -f "$SITE_DIR/_classified/$slug.md" ]; then
  recipe="$SITE_DIR/_classified/$slug.md"
  classified=1
fi
[ -f "$recipe" ] || { echo "No recipe called $slug in _recipes/." >&2; exit 1; }

if [ -z "$alt" ]; then
  alt="$(sed -n 's/^#\{0,1\} \{0,1\}image_alt: *//p' "$recipe" | head -1)"
  [ -n "$alt" ] || { echo "Give alt text (a short description of the photo) as the 4th argument." >&2; exit 1; }
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Crop to 3:2 around the focus point.
read -r width height < <(sips -g pixelWidth -g pixelHeight "$photo" | awk '/pixelWidth/ {w=$2} /pixelHeight/ {h=$2} END {print w, h}')
if [ $((width * 2)) -gt $((height * 3)) ]; then
  crop_h=$height
  crop_w=$((height * 3 / 2))
  off_x=$(((width - crop_w) * focus / 100))
  off_y=0
else
  crop_w=$width
  crop_h=$((width * 2 / 3))
  off_x=0
  off_y=$(((height - crop_h) * focus / 100))
fi
sips -s format png -c "$crop_h" "$crop_w" --cropOffset "$off_y" "$off_x" "$photo" --out "$tmp/crop.png" >/dev/null

# Never enlarge: a small photo stays its own size.
large=$((crop_w < MAX_WIDTH ? crop_w : MAX_WIDTH))
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$slug".jpg "$OUT_DIR/$slug".webp "$OUT_DIR/$slug"-*.webp
sips -s format jpeg -s formatOptions 80 --resampleWidth "$large" "$tmp/crop.png" --out "$OUT_DIR/$slug.jpg" >/dev/null
cwebp -quiet -q 78 -resize "$large" 0 "$tmp/crop.png" -o "$OUT_DIR/$slug.webp"
for w in "${SMALL_WIDTHS[@]}"; do
  if [ "$w" -lt "$large" ]; then
    cwebp -quiet -q 78 -resize "$w" 0 "$tmp/crop.png" -o "$OUT_DIR/$slug-$w.webp"
  fi
done

# Point the recipe at it: replace image: / image_alt: (even commented-out ones),
# or add them after added: (or category:).
SLUG="$slug" ALT="$alt" python3 - "$recipe" <<'PY'
import json, os, re, sys
path = sys.argv[1]
text = open(path).read()
head, sep, rest = text.partition("\n---\n")
alt = os.environ["ALT"]
image = f"image: /assets/images/recipes/{os.environ['SLUG']}.jpg"
alt_line = "image_alt: " + (json.dumps(alt) if re.search(r"[:#]|^[\W]", alt) else alt)
lines = [l for l in head.split("\n") if not re.match(r"#?\s?image_alt:", l)]
i = next((n for n, l in enumerate(lines) if re.match(r"#?\s?image:", l)), None)
if i is not None:
    lines[i] = image
else:
    after = next((n for n, l in enumerate(lines) if l.startswith(("added:", "category:"))), None)
    if after is None:
        sys.exit(f"Couldn't find where to put image: in {path}.")
    i = after + 1
    lines.insert(i, image)
lines.insert(i + 1, alt_line)
open(path, "w").write("\n".join(lines) + sep + rest)
PY

echo "Saved $(cd "$OUT_DIR" && ls "$slug".jpg "$slug".webp "$slug"-*.webp 2>/dev/null | tr '\n' ' ')"
echo "Cropped ${width}x${height} to ${crop_w}x${crop_h} (focus $focus), saved ${large}px wide."
echo "Updated ${recipe#"$SITE_DIR"/}."
[ "$classified" = 1 ] && echo "Classified recipe: run ./classified.sh next."
echo "Check it with ./serve.sh. If the crop is off, run this again with a different focus."
