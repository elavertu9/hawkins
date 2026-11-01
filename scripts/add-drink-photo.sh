#!/bin/bash
# Add a photo for a drink on /caffeine/: crops it to the 4:5 frame, saves a JPG
# plus smaller WebP copies for phones (assets/images/drinks/), and strips all
# metadata (location, camera). It doesn't edit _data/drinks.yml; it prints the
# two lines to add to the drink.
#
# Usage: scripts/add-drink-photo.sh <drink> <photo> [focus] ["alt text"]
#
#   drink    the drink's id in _data/drinks.yml, e.g. hawkins
#   photo    any image file (from a phone is fine; HEIC, PNG, and JPG all work)
#   focus    which part to keep when cropping, 0-100 (default 50, the middle).
#            For a tall photo, 0 keeps the top and 100 the bottom; for a wide
#            one, 0 keeps the left and 100 the right.
#   alt      a short description for screen readers, for the photo_alt: line.
#
# Needs macOS (sips) and cwebp/dwebp (brew install webp).

set -euo pipefail

SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$SITE_DIR/assets/images/drinks"
MAX_WIDTH=960
SMALL_WIDTHS=(480 800)

if [ $# -lt 2 ]; then
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi
slug="$1"
photo="$2"
focus="${3:-50}"
alt="${4:-}"

command -v sips >/dev/null || { echo "This needs macOS (sips)." >&2; exit 1; }
command -v cwebp >/dev/null || { echo "This needs cwebp: brew install webp" >&2; exit 1; }
command -v dwebp >/dev/null || { echo "This needs dwebp: brew install webp" >&2; exit 1; }
[ -f "$photo" ] || { echo "No photo at $photo." >&2; exit 1; }
[[ "$focus" =~ ^[0-9]+$ ]] && [ "$focus" -le 100 ] || { echo "focus must be 0-100." >&2; exit 1; }
[[ "$slug" =~ ^[a-z0-9-]+$ ]] || { echo "The drink's id is lowercase letters, numbers and dashes, e.g. hawkins." >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Crop to 4:5 around the focus point.
read -r width height < <(sips -g pixelWidth -g pixelHeight "$photo" | awk '/pixelWidth/ {w=$2} /pixelHeight/ {h=$2} END {print w, h}')
if [ $((width * 5)) -gt $((height * 4)) ]; then
  crop_h=$height
  crop_w=$((height * 4 / 5))
  off_x=$(((width - crop_w) * focus / 100))
  off_y=0
else
  crop_w=$width
  crop_h=$((width * 5 / 4))
  off_x=0
  off_y=$(((height - crop_h) * focus / 100))
fi
sips -s format png -c "$crop_h" "$crop_w" --cropOffset "$off_y" "$off_x" "$photo" --out "$tmp/crop.png" >/dev/null

# Never enlarge: a small photo stays its own size.
large=$((crop_w < MAX_WIDTH ? crop_w : MAX_WIDTH))
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$slug".jpg "$OUT_DIR/$slug".webp "$OUT_DIR/$slug"-*.webp
# The WebPs carry no metadata. The JPG is made from the WebP's pixels, through a
# fresh PNG, so nothing from the original (a phone photo has its location and
# camera) can come along.
cwebp -quiet -metadata none -q 78 -resize "$large" 0 "$tmp/crop.png" -o "$OUT_DIR/$slug.webp"
for w in "${SMALL_WIDTHS[@]}"; do
  if [ "$w" -lt "$large" ]; then
    cwebp -quiet -metadata none -q 78 -resize "$w" 0 "$tmp/crop.png" -o "$OUT_DIR/$slug-$w.webp"
  fi
done
dwebp -quiet "$OUT_DIR/$slug.webp" -o "$tmp/clean.png"
sips -s format jpeg -s formatOptions 82 "$tmp/clean.png" --out "$OUT_DIR/$slug.jpg" >/dev/null

echo "Saved $(cd "$OUT_DIR" && ls "$slug".jpg "$slug".webp "$slug"-*.webp 2>/dev/null | tr '\n' ' ')"
echo "Cropped ${width}x${height} to ${crop_w}x${crop_h} (focus $focus), saved ${large}px wide, metadata stripped."
echo
echo "Add these to the drink in _data/drinks.yml:"
echo "    photo: /assets/images/drinks/$slug.jpg"
echo "    photo_alt: ${alt:-Describe the photo for screen readers}"
echo
echo "Check it with ./serve.sh. If the crop is off, run this again with a different focus."
