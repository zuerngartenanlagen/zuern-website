/* ============================================================================
   The walk: a frame sequence scrubbed by scroll.

   Why frames and not <video>: seeking a video on every scroll tick is what made
   the walk stutter, worst on phones. Decoded frames on a canvas draw in
   constant time. At 16 fps the page crossfades between neighbouring frames, so
   motion stays fluid with a third fewer bytes.

     data-walk-d / data-walk-m   frame URL prefixes (desktop, phone): 001.webp …
     data-frames                 frame count
     data-hold                   share of the walk that rests on the last frame

   Frames load coarse to fine (every 16th, then 8th, …), so the whole walk is
   scrubbable almost at once and sharpens as the rest arrives. Under reduced
   motion nothing loads; the poster holds.
   ========================================================================== */
(function () {
  'use strict';

  var act = document.querySelector('[data-walk]');
  var cv = act && act.querySelector('canvas[data-frames]');
  if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var LERP = 0.16;         // playhead smoothing per frame
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
  var queue = [], seen = new Uint8Array(N);
  [16, 8, 4, 2, 1].forEach(function (step) {
    for (var i = 0; i < N; i += step) if (!seen[i]) { seen[i] = 1; queue.push(i); }
  });
  if (queue.indexOf(N - 1) > 1) { queue.splice(queue.indexOf(N - 1), 1); queue.splice(1, 0, N - 1); }

  function src(i) { return base + String(i + 1).padStart(3, '0') + '.webp'; }
  function next() {
    if (!queue.length) return;
    var i = queue.shift(), img = new Image();
    img.src = src(i);
    img.decode().then(function () {
      frames[i] = img; ready[i] = 1;
      if (i === 0) first();
      state.dirty = true;
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
  }

  function cover(img, alpha) {
    var cw = cv.width, ch = cv.height;
    var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    var w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  function draw(pos) {
    var a = Math.floor(pos), f = pos - a;
    var ia = nearest(a);
    if (ia < 0) return;
    cover(frames[ia], 1);
    // Blend toward the next frame only when both real neighbours are here.
    if (f > 0.02 && a + 1 < N && ready[a] && ready[a + 1]) cover(frames[a + 1], f);
    ctx.globalAlpha = 1;
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
