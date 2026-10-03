#!/usr/bin/env bash
# Generate the picture variants in src/assets/images/ from the two originals.
#
#   tools/images.sh [portrait] [face]
#
# portrait   the big picture, cropped to 4:5 and written at 480, 800 and 1200 px
# face       the small picture, cropped square and written at 240 px
#
# Both are expected in raw/ (see .gitignore) and are only used here: what the
# site loads are the generated WebP, without metadata. ImageMagick does the
# work; nothing is installed beyond it.
#
#   just images
set -euo pipefail
cd "$(dirname "$0")/.."

PORTRAIT=${1:-raw/marcel-portrait.jpg}
FACE=${2:-raw/marcel-face.jpg}
OUT=${OUT:-src/assets/images}

command -v magick >/dev/null || { echo "ImageMagick (magick) fehlt" >&2; exit 1; }

for src in "$PORTRAIT" "$FACE"; do
  [ -f "$src" ] || { echo "keine Datei: $src" >&2; exit 1; }
done
mkdir -p "$OUT"

# WebP, slow encoder, no metadata. The portrait keeps its 4:5 format whatever
# the original is, because index.html declares those widths and heights.
for w in 480 800 1200; do
  h=$((w * 5 / 4))
  magick "$PORTRAIT" -auto-orient \
    -resize "${w}x${h}^" -gravity center -extent "${w}x${h}" \
    -strip -quality 82 -define webp:method=6 "$OUT/marcel-zuern-$w.webp"
  echo "marcel-zuern-$w.webp  ${w}x${h}"
done

# The face sits in a brass ring (garden.css), so a square is all it needs.
magick "$FACE" -auto-orient \
  -resize '240x240^' -gravity center -extent 240x240 \
  -strip -quality 82 -define webp:method=6 "$OUT/marcel-zuern-face.webp"
echo "marcel-zuern-face.webp  240x240"
