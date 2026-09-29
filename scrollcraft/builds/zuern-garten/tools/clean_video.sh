#!/usr/bin/env bash
# Clean the reference film for scrubbing: blur its baked-in title card (logo block
# and brush stroke) until the film's own title has faded, and crop off its green
# SCROLL rail with a push-in that eases back to the full frame by 4.25s. The last
# frame is held 1.5s so the arrival can rest on the house.
#   bash tools/clean_video.sh ~/Videos/marcel-zuern.mp4 out/clean.mp4
set -euo pipefail
src=${1:?source video}; dst=${2:?output}
dir=$(dirname "$dst"); mkdir -p "$dir"
magick -size 1280x720 xc:black -fill white \
  -draw "rectangle 20,0 560,520" -draw "rectangle 720,0 1170,140" -blur 0x28 "$dir/logo-mask.png"
# s = smoothstep over 2.95..4.25s; zoom = 1 + 0.115 * (1 - s)
u="clip((in/24-2.95)/1.3\,0\,1)"
ffmpeg -v error -y -i "$src" -loop 1 -i "$dir/logo-mask.png" -filter_complex "\
[0:v]fps=24,split[a][b];\
[b]gblur=sigma=70:steps=4,format=rgba[bb];\
[1:v]format=gray,trim=duration=10.05[m];\
[bb][m]alphamerge,fade=t=out:st=3.15:d=0.45:alpha=1[ov];\
[a][ov]overlay=0:0:shortest=1,scale=2560:1440:flags=lanczos,\
zoompan=z='1+0.115*(1-$u*$u*(3-2*$u))':x='0':y='(ih-ih/zoom)/2':d=1:s=1280x720:fps=24,tpad=stop_mode=clone:stop_duration=1.5[v]" \
  -map "[v]" -an -c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p "$dst"
