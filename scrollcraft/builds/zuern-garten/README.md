# Schritt in den Garten (scroll hero)


Scroll-driven walk into the garden, rebuilt from the opening frame of
`~/Videos/marcel-zuern.mp4` in the Zürn brand (Patina & Messing, Montserrat, leaf logo).

Run: `node <scroll-craft>/scripts/serve.mjs --root . --port 4500`, open http://localhost:4500

Two versions:

- `index.html`: **the original film**, scrubbed by scroll (10 viewport-heights), with
  the services as stops along the path, then Planung, Über mich, Kontakt.
  `tools/clean_video.sh` blurs the film's own title card, crops its SCROLL rail
  with an eased push-in, and holds the last frame 1.5s for the arrival. Encoded
  at native 720p with dense keyframes (`assets/walk.mp4`, phone crop `walk-m.mp4`).
  Copy timing: `data-g-window="in0 in1 out0 out1"` in scroll progress (0..1 of the walk).
- `layers.html`: the rebuilt scene in separate layers (below), for the castle swap.

Logos: `zuern-logo-light.svg` on dark, `zuern-logo.svg` on light. The leaf is the favicon only.

## Layers

| File | What | Depth |
|---|---|---|
| `assets/ground.webp` + `depth.png` | the continuous garden, displaced per pixel | per pixel |
| `assets/castle.webp` | **the building (placeholder pavilion)** | `layers.json → castle` |
| `assets/tree.webp` | the multi-stem tree | `layers.json → tree` |
| `assets/boulder.webp`, `reeds.webp` | foreground props the camera walks past | `layers.json` |
| `assets/water.png` | pond mask for ripples | |

The ground has **nothing** behind the castle and the tree but trees and sky, so a
different building or tree drops in cleanly.

## Putting in your castle

1. Export the castle as a PNG/WebP **with transparency**, photographed/rendered from
   roughly the same eye height, lit from the same soft overcast sky.
2. Save it as `assets/castle.webp` (or point `data-castle` in `index.html` at it).
3. In `assets/layers.json`, set `castle.rect` = `[x, y, width, height]` as fractions
   of the scene (0..1, origin top-left; the scene is 16:9). The bottom edge of the
   rect is where the building stands; planting in the ground covers its base.
4. `castle.depth` (0 = sky, 1 = at the camera) controls how fast it grows as you
   walk. 0.25 keeps it where the pavilion was; lower = farther away.
5. Update `assets/poster.webp` (the no-WebGL / reduced-motion still) with a
   screenshot of the page at the top.

Dev views: `?view=ground` hides all cards, `?view=depth` shows the depth hit.

## Rebuilding the layers

`tools/cut_layers.py` cuts `gen/master.png` / `plate.png` / `ground.png` into the
layers (venv with torch, transformers, opencv: `~/.cache/scrollcraft-venv`).
