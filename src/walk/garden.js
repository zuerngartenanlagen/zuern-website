/* ============================================================================
   The walk's copy: the opening panel, the stops and the arrival fade and slide
   by the scroll progress of the pinned walk (data-g-window), and the small
   logo top left comes and goes with it. The film itself is walk.js. Under
   reduced motion nothing here moves: the poster and static copy hold.
   ========================================================================== */
(function () {
  'use strict';

  var act = document.querySelector('[data-garden]');
  if (!act) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var ease = function (t) { return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------- copy windows --
  // data-g-window="in0 in1 out0 out1" in act progress. Omit out for "stays".
  var copies = [].slice.call(act.querySelectorAll('[data-g-window]')).map(function (el) {
    return { el: el, w: el.getAttribute('data-g-window').split(/\s+/).map(Number) };
  });
  var phone = matchMedia('(max-width: 760px)');

  function copyAt(p) {
    var listed = !phone.matches;
    copies.forEach(function (c) {
      var w = c.w;
      var o = w[0] === w[1] ? (p >= w[0] ? 1 : 0) : ease(clamp((p - w[0]) / (w[1] - w[0]), 0, 1));
      var out = w.length > 2 ? ease(clamp((p - w[2]) / (w[3] - w[2]), 0, 1)) : 0;
      var vis = o * (1 - out);
      if (c.el.getAttribute('data-g-move') === 'panel') {
        // A panel does not fade: it slides off, left on desktop, up on phones.
        var gone = out * 105;
        c.el.style.transform = phone.matches ? 'translate3d(0,' + -gone + '%,0)' : 'translate3d(' + -gone + '%,0,0)';
        c.el.classList.toggle('is-hidden', out > 0.99);
        return;
      }
      if (listed && c.el.classList.contains('stop')) {
        // Large screens: all stops stand in one column; the one whose stretch
        // of the walk this is gets lit, the rest stay dimmed (walk.css).
        c.el.style.opacity = ''; c.el.style.transform = '';
        c.el.classList.remove('is-hidden');
        c.el.classList.toggle('is-current', vis > 0.5);
        return;
      }
      c.el.classList.remove('is-current');
      c.el.style.opacity = vis.toFixed(3);
      c.el.style.transform = 'translate3d(0,' + ((1 - o) * 18 - out * 26).toFixed(1) + 'px,0)';
      c.el.classList.toggle('is-hidden', vis < 0.02);
    });
  }

  function progress() {
    var r = act.getBoundingClientRect();
    var travel = r.height - innerHeight;
    return travel > 0 ? clamp(-r.top / travel, 0, 1) : 0;
  }

  // A hidden block that receives keyboard focus scrolls itself into its window.
  copies.forEach(function (c) {
    c.el.addEventListener('focusin', function () {
      if (!c.el.classList.contains('is-hidden')) return;
      var r = act.getBoundingClientRect();
      var target = (c.w[1] + (c.w.length > 2 ? c.w[2] : 1)) / 2;
      scrollTo({ top: scrollY + r.top + target * (r.height - innerHeight), behavior: 'instant' });
    });
  });

  // The small top-left logo: on once the opening panel has gone.
  var brand = document.querySelector('[data-g-brand]');
  function brandAt() {
    if (!brand) return;
    var p = progress();
    brand.classList.toggle('is-on', reduce ? scrollY > innerHeight * 0.6 : (p > 0.12 || act.getBoundingClientRect().bottom < innerHeight));
  }
  addEventListener('scroll', brandAt, { passive: true });
  addEventListener('resize', brandAt);
  brandAt();

  if (reduce) return;

  // Copy follows the scroll progress of the pinned walk.
  var last = -1;
  function loop() {
    var p = progress();
    if (p !== last) { last = p; copyAt(p); }
    requestAnimationFrame(loop);
  }
  // Crossing the phone breakpoint switches between one card and the column.
  phone.addEventListener('change', function () { copyAt(progress()); });
  copyAt(progress());
  requestAnimationFrame(loop);
})();
