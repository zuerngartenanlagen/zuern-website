/* ============================================================================
   The walk: a frame sequence scrubbed by scroll.

   Why frames and not <video>: seeking a video on every scroll tick is what made
   the walk stutter, worst on phones. Decoded frames on a canvas draw in
   constant time. 24 fps, 2x upscaled, drawn crisp (no blending: a blend of two
   camera positions reads as blur).

     data-walk-d / data-walk-m   frame URL prefixes (desktop, phone): 001.avif …
     data-frames                 frame count
     data-hold                   share of the walk that rests on the last frame

   Frames load outward from the playhead, ahead first, so what you are about to
   see is always what arrives next. Until a frame is here its nearest loaded
   neighbour stands in. Under reduced motion nothing loads; the poster holds.
   ========================================================================== */
(function () {
  'use strict';

  var act = document.querySelector('[data-walk]');
  var cv = act && act.querySelector('canvas[data-frames]');
  if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var LERP = 0.22;         // playhead smoothing per frame
  var AHEAD = 24;          // frames ahead of the playhead that load first
  var CONCURRENCY = 6;

  var phone = matchMedia('(max-width: 760px)').matches;
  var base = phone ? cv.dataset.walkM : cv.dataset.walkD;
  var N = parseInt(cv.dataset.frames, 10);
  var HOLD = parseFloat(cv.dataset.hold) || 0;
  var ctx = cv.getContext('2d', { alpha: false });
  var frames = new Array(N);
  var ready = new Uint8Array(N);
  var state = { cur: 0, target: 0, dirty: true, visible: true, live: false };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  // ---------------------------------------------------------------- loading --
  var asked = new Uint8Array(N);
  function pick() {
    var at = Math.round(state.target);
    for (var d = 0; d <= AHEAD; d++) if (at + d < N && !asked[at + d]) return at + d;
    for (d = 1; d <= AHEAD / 2; d++) if (at - d >= 0 && !asked[at - d]) return at - d;
    for (var i = 0; i < N; i++) if (!asked[i]) return i;
    return -1;
  }

  function src(i) { return base + String(i + 1).padStart(3, '0') + '.avif'; }
  function next() {
    var i = pick();
    if (i < 0) return;
    asked[i] = 1;
    var img = new Image();
    img.src = src(i);
    img.decode().then(function () {
      frames[i] = img; ready[i] = 1;
      if (i === 0) first();
      state.dirty = true;
      drawn = -1;
    }, function () { /* a missing frame falls back to its neighbours */ })
      .then(next);
  }
  for (var k = 0; k < CONCURRENCY; k++) next();

  function nearest(i) {
    for (var d = 0; d < N; d++) {
      if (i - d >= 0 && ready[i - d]) return i - d;
      if (i + d < N && ready[i + d]) return i + d;
    }
    return -1;
  }

  // ---------------------------------------------------------------- drawing --
  function resize() {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(cv.clientWidth * dpr);
    cv.height = Math.round(cv.clientHeight * dpr);
    state.dirty = true;
    drawn = -1;
  }

  function cover(img) {
    var cw = cv.width, ch = cv.height;
    var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    var w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  var drawn = -1;
  function draw(pos) {
    var i = nearest(Math.round(pos));
    if (i < 0 || i === drawn) return;
    cover(frames[i]);
    drawn = i;
  }

  function first() {
    resize();
    draw(state.cur);
    state.live = true;
    act.classList.add('is-live');
  }

  function progress() {
    var r = act.getBoundingClientRect();
    var travel = r.height - innerHeight;
    return travel > 0 ? clamp(-r.top / travel, 0, 1) : 0;
  }

  function tick() {
    requestAnimationFrame(tick);
    if (!state.visible || !state.live) return;
    state.target = clamp(progress() / (1 - HOLD), 0, 1) * (N - 1);
    var d = state.target - state.cur;
    if (Math.abs(d) < 0.004 && !state.dirty) return;
    state.cur = Math.abs(d) < 0.004 ? state.target : state.cur + d * LERP;
    draw(state.cur);
    state.dirty = false;
  }

  addEventListener('resize', function () { if (state.live) resize(); });
  new IntersectionObserver(function (e) { state.visible = e[0].isIntersecting; }).observe(act);
  requestAnimationFrame(tick);
})();
