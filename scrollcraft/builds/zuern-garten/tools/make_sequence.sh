#!/usr/bin/env bash
# Turn the reference film into sharp scroll-scrub frame sequences.
#  1. extract 24 fps PNG frames from 3.35s (after the film's own title card and
#     SCROLL rail are gone, so nothing needs blurring)
#  2. upscale 2x with Real-ESRGAN (tools/upscale.py): the film is only 720p
#  3. encode AVIF sets; walk.js picks one by the pixels the screen needs:
#       d  1600x900    normal desktop
#       h  2560x1440   large and tall screens (the full upscaled frame)
#       m  1120x1440   phones (full-resolution portrait centre crop)
#     plus WebP posters of the first frame
#   bash tools/make_sequence.sh ~/Videos/marcel-zuern.mp4 public/walk/seq
set -euo pipefail
src=${1:?source video}; dst=${2:?output dir}
here=$(cd "$(dirname "$0")" && pwd); work=$here/../out
py=${SCROLLCRAFT_PY:-$HOME/.cache/scrollcraft-venv/bin/python}
mkdir -p "$work/frames"
[ -f "$work/frames/001.png" ] || ffmpeg -v error -y -ss 3.35 -i "$src" -vf fps=24 "$work/frames/%03d.png"
"$py" "$here/upscale.py" "$work/frames" "$work/frames-2x"
rm -rf "$dst/d" "$dst/h" "$dst/m"; mkdir -p "$dst/d" "$dst/h" "$dst/m"
for f in "$work"/frames-2x/*.png; do
  n=$(basename "$f" .png)
  magick "$f" -filter Lanczos -resize 1600x -quality 50 -define heic:speed=6 "$dst/d/$n.avif" &
  magick "$f" -quality 45 -define heic:speed=6 "$dst/h/$n.avif" &
  magick "$f" -crop 1120x1440+720+0 +repage -quality 45 -define heic:speed=6 "$dst/m/$n.avif" &
  while [ "$(jobs -r | wc -l)" -ge 9 ]; do sleep 0.2; done
done
wait
magick "$work/frames-2x/001.png" -filter Lanczos -resize 1600x -quality 80 "$dst/poster-d.webp"
magick "$work/frames-2x/001.png" -crop 1120x1440+720+0 +repage -quality 80 "$dst/poster-m.webp"
echo "frames: $(ls "$dst/d" | wc -l)  d $(du -sh "$dst/d" | cut -f1)  h $(du -sh "$dst/h" | cut -f1)  m $(du -sh "$dst/m" | cut -f1)"
