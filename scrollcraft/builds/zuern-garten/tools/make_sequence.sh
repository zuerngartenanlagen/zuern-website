#!/usr/bin/env bash
# Turn the reference film into sharp scroll-scrub frame sequences.
#  1. extract 24 fps PNG frames from 3.35s (after the film's own title card and
#     SCROLL rail are gone, so nothing needs blurring)
#  2. upscale 2x with Real-ESRGAN (tools/upscale.py): the film is only 720p
#  3. encode AVIF: desktop 1600px, phone portrait centre crop 720px; plus a WebP
#     poster of the first frame for each
#   bash tools/make_sequence.sh ~/Videos/marcel-zuern.mp4 assets/seq
set -euo pipefail
src=${1:?source video}; dst=${2:?output dir}
here=$(cd "$(dirname "$0")" && pwd); work=$here/../out
py=${SCROLLCRAFT_PY:-$HOME/.cache/scrollcraft-venv/bin/python}
mkdir -p "$work/frames"
[ -f "$work/frames/001.png" ] || ffmpeg -v error -y -ss 3.35 -i "$src" -vf fps=24 "$work/frames/%03d.png"
"$py" "$here/upscale.py" "$work/frames" "$work/frames-2x"
rm -rf "$dst/d" "$dst/m"; mkdir -p "$dst/d" "$dst/m"
for f in "$work"/frames-2x/*.png; do
  n=$(basename "$f" .png)
  magick "$f" -filter Lanczos -resize 1600x -quality 50 -define heic:speed=6 "$dst/d/$n.avif" &
  magick "$f" -crop 1120x1440+720+0 +repage -filter Lanczos -resize 720x -quality 50 -define heic:speed=6 "$dst/m/$n.avif" &
  while [ "$(jobs -r | wc -l)" -ge 8 ]; do sleep 0.2; done
done
wait
magick "$work/frames-2x/001.png" -filter Lanczos -resize 1600x -quality 80 "$dst/poster-d.webp"
magick "$work/frames-2x/001.png" -crop 1120x1440+720+0 +repage -filter Lanczos -resize 720x -quality 80 "$dst/poster-m.webp"
echo "frames: $(ls "$dst/d" | wc -l)  desktop $(du -sh "$dst/d" | cut -f1)  phone $(du -sh "$dst/m" | cut -f1)"
