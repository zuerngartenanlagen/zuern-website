#!/usr/bin/env bash
# Turn the reference film into scroll-scrub frame sequences.
# Starts at 3.35s, after the film's own title card and SCROLL rail are gone, so
# nothing needs blurring. 16 fps: the page crossfades between neighbours.
#   bash tools/make_sequence.sh ~/Videos/marcel-zuern.mp4 assets/seq
set -euo pipefail
src=${1:?source video}; dst=${2:?output dir}
start=3.35
clean="fps=16,hqdn3d=2:2:6:6"
rm -rf "$dst/d" "$dst/m"; mkdir -p "$dst/d" "$dst/m"
# desktop: full 16:9 frame
ffmpeg -v error -y -ss $start -i "$src" -vf "$clean,scale=1120:-2:flags=lanczos" \
  -c:v libwebp -quality 64 "$dst/d/%03d.webp"
# phone: portrait centre crop (tree, path, then the house)
ffmpeg -v error -y -ss $start -i "$src" -vf "$clean,crop=560:720:360:0,scale=480:-2:flags=lanczos" \
  -c:v libwebp -quality 62 "$dst/m/%03d.webp"
echo "frames: $(ls "$dst/d" | wc -l)  desktop $(du -sh "$dst/d" | cut -f1)  phone $(du -sh "$dst/m" | cut -f1)"
