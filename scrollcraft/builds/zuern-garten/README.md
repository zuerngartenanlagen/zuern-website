# Schritt in den Garten (scroll hero)


Scroll-driven walk into the garden, rebuilt from the opening frame of
`~/Videos/marcel-zuern.mp4` in the Zürn brand (Patina & Messing, Montserrat, leaf logo).

The page now lives in the site itself and is built by Vite (`just dev` at the
project root): `index.html` (the walk, homepage), code in `src/walk/`, runtime
assets in `public/walk/seq/`. This folder keeps the brief and the asset tools.

- `index.html`: **the original film** as a frame sequence scrubbed by scroll (6
  viewport-heights), with the services as stops along the path, then Planung,
  Über mich, Kontakt. `tools/make_sequence.sh` starts the film at 3.35s (after its
  own title card and rail), upscales every frame 2x with Real-ESRGAN
  (`tools/upscale.py`, local GPU) and writes 24 fps AVIF frame sets in `public/walk/seq`: `d` 1600px (desktop),
  `h` 2560px (large and tall screens), `m` 1120x1440 (phone portrait crop);
  `walk.js` picks the set by the pixels the canvas needs. `walk.js` draws them with
  WebGL, loading outward from the playhead and blending neighbours by the
  playhead fraction. Frames instead of `<video>` because seeking a video per
  scroll tick stutters, worst on phones. It plays **backwards** by default
  (`data-direction="reverse"`: house first, out to the pond); `?walk=forward`
  shows the old direction.
  Moving water: `tools/water_masks.py` finds the pond in every frame (SegFormer,
  ADE20K water classes) and packs the masks into `public/walk/seq/water-{d,m}.webp`;
  the shader shimmers and drops rings only inside them, also while scroll rests.
  Wheel smoothing: Lenis (`lenis.min.js`, MIT), off under reduced motion.
  Copy timing: `data-g-window="in0 in1 out0 out1"` in scroll progress (0..1 of the walk).
