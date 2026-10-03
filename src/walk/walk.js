/* ============================================================================
   The walk: a frame sequence scrubbed by scroll, with moving water.

   Why frames and not <video>: seeking a video on every scroll tick is what made
   the walk stutter, worst on phones. 24 fps, 2x upscaled frames on a WebGL
   canvas. Between two frames the shader blends by the playhead's fraction, so a
   wheel notch glides instead of stepping.

   The pond moves on its own: per-frame water masks (tools/water_masks.py, one
   atlas image) tell the shader where the water is, and only there it adds a slow
   shimmer and now and then a ring from a falling drop.

     data-walk-d / -h / -m       frame URL prefixes: desktop 1600px, large screens
                                 2560px, phone portrait 1120px (001.avif …). The
                                 set is picked by the pixels the canvas needs.
     data-water                  water atlas prefix: {prefix}-d.webp, -m.webp, .json
     data-frames                 frame count
     data-hold                   share of the walk that rests on the last frame
     data-direction              "reverse" plays the film backwards (house first,
                                 then back out over the pond); ?walk=forward
                                 overrides it, to compare

   Frames load outward from the playhead, ahead first. Until a frame is here its
   nearest loaded neighbour stands in. Without WebGL the frames draw plain in 2D.
   Under reduced motion nothing loads; the poster holds.
   ========================================================================== */
(function () {
  'use strict';

  var act = document.querySelector('[data-walk]');
  var cv = act && act.querySelector('canvas[data-frames]');
  if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var LERP = 0.18;         // playhead smoothing per frame (scroll is already smoothed)
  var AHEAD = 24;          // frames ahead of the playhead that load first
  var CONCURRENCY = 6;
  var MAX_DROPS = 4;
  var JUMP_FRAMES = 12;    // scroll moving the film this far in one tick is a jump: no easing
  var REST_MS = 120;       // scroll still this long: settle on a whole frame
  var WET_FADE = 0.06;     // water fades in at rest and out on the move, per frame

  var phone = matchMedia('(max-width: 760px)').matches;
  // Frame height the canvas needs at device resolution. Cover-fit fills the height
  // on tall windows and the width on wide ones; the film is 16:9.
  var needH = Math.max(cv.clientHeight, cv.clientWidth * 9 / 16) * (devicePixelRatio || 1);
  var hd = !phone && !!cv.dataset.walkH && needH > 1000;
  // Frame prefixes read from the data-walk-* attributes, resolved against the
  // document so the site works under any base path (a project subpath, the
  // custom domain, a folder opened from disk).
  function at(path) { return new URL(path, document.baseURI).href; }
  var base = at(phone ? cv.dataset.walkM : hd ? cv.dataset.walkH : cv.dataset.walkD);
  var N = parseInt(cv.dataset.frames, 10);
  var HOLD = parseFloat(cv.dataset.hold) || 0;
  var query = new URLSearchParams(location.search).get('walk');
  var REVERSE = (query || cv.dataset.direction) === 'reverse';
  var frames = new Array(N);
  var ready = new Uint8Array(N);
  var state = { cur: 0, target: 0, dirty: true, visible: true, live: false };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  // Scroll position -> film frame. Loading and nearest() work in film frames.
  function film(pos) { return REVERSE ? N - 1 - pos : pos; }

  // ---------------------------------------------------------------- loading --
  var asked = new Uint8Array(N);
  function pick() {
    // "Ahead" follows the walk, which runs down the film when reversed.
    var at = Math.round(film(state.target)), dir = REVERSE ? -1 : 1, j;
    for (var d = 0; d <= AHEAD; d++) { j = at + d * dir; if (j >= 0 && j < N && !asked[j]) return j; }
    for (d = 1; d <= AHEAD / 2; d++) { j = at - d * dir; if (j >= 0 && j < N && !asked[j]) return j; }
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
      if (i === Math.round(film(0))) first();
      state.dirty = true;
    }, function () { /* a missing frame falls back to its neighbours */ })
      .then(next);
  }

  function nearest(i) {
    for (var d = 0; d < N; d++) {
      if (i - d >= 0 && ready[i - d]) return i - d;
      if (i + d < N && ready[i + d]) return i + d;
    }
    return -1;
  }

  // ------------------------------------------------------------- renderers --
  var gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
  var R = gl ? glRenderer(gl) : null;
  if (!R) R = plainRenderer(cv.getContext('2d', { alpha: false }));

  function plainRenderer(ctx) {
    var drawn = -1;
    return {
      animated: false,
      reset: function () { drawn = -1; },
      draw: function (pos) {
        var i = nearest(Math.round(film(pos)));
        if (i < 0 || i === drawn) return;
        var img = frames[i], cw = cv.width, ch = cv.height;
        var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
        var w = img.naturalWidth * s, h = img.naturalHeight * s;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
        drawn = i;
      }
    };
  }

  function glRenderer(gl) {
    var VERT = 'attribute vec2 a;varying vec2 vUv;void main(){vUv=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
    var FRAG = [
      '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif',
      'varying vec2 vUv;',
      'uniform sampler2D uA,uB,uMask;',
      'uniform float uMix,uTime,uAspect,uHasMask;',
      'uniform vec2 uFit,uCell,uCellA;',
      'uniform vec4 uDrop[' + MAX_DROPS + '];',
      'void main(){',
      '  vec2 uv=.5+(vUv-.5)*uFit;',
      '  float w=uHasMask*texture2D(uMask,uCellA+clamp(uv,.002,.998)*uCell).r;',
      '  vec2 disp=vec2(0.);float hl=0.;',
      '  if(w>.01){',
      // Slow shimmer: a few crossing swells, squashed vertically like a foreshortened surface.
      '    float t=uTime;',
      '    disp.x=sin(uv.y*150.+t*1.4+sin(uv.x*20.+t*.5)*2.)*.0014+sin(uv.y*310.-t*2.1+uv.x*40.)*.0006;',
      '    disp.y=sin(uv.x*70.+t*1.1+uv.y*60.)*.0008;',
      '    hl=sin(uv.y*150.+t*1.4+sin(uv.x*20.+t*.5)*2.)*.35;',
      '    for(int k=0;k<' + MAX_DROPS + ';k++){',
      '      vec4 D=uDrop[k]; if(D.w<=0.) continue;',
      '      vec2 d=(uv-D.xy)*vec2(uAspect,uAspect*2.6);',
      '      float r=length(d),rad=D.z*.06;',
      '      float ring=exp(-pow((r-rad)*28.,2.));',
      '      float env=D.w*exp(-D.z*.7)*smoothstep(0.,.2,D.z);',
      '      float wv=sin((r-rad)*240.)*ring*env;',
      '      disp+=d/max(r,1e-4)*wv*.0045; hl+=wv;',
      '    }',
      '    disp*=w;',
      '  }',
      '  vec3 c=mix(texture2D(uA,uv+disp).rgb,texture2D(uB,uv+disp).rgb,uMix);',
      '  c+=vec3(.92,.94,.9)*hl*.035*w;',
      '  gl_FragColor=vec4(c,1.);',
      '}'
    ].join('\n');

    function shader(type, s) {
      var o = gl.createShader(type);
      gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    }
    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) {
      console.error('[walk] shader failed, drawing plain', err);
      return null;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['uA', 'uB', 'uMask', 'uMix', 'uTime', 'uAspect', 'uHasMask', 'uFit', 'uCell', 'uCellA', 'uDrop'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    function tex(unit) {
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(function (p) {
        gl.texParameteri(gl.TEXTURE_2D, p[0], p[1]);
      });
      return t;
    }
    // Two frame slots; stepping one frame re-uploads only the new neighbour.
    var slots = [{ t: tex(0), idx: -1 }, { t: tex(1), idx: -1 }];
    var maskTex = tex(2);
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uMask, 2);
    gl.uniform1f(U.uHasMask, 0);

    function upload(slot, i) {
      gl.activeTexture(gl.TEXTURE0 + slots.indexOf(slot));
      gl.bindTexture(gl.TEXTURE_2D, slot.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, frames[i]);
      slot.idx = i;
    }
    // Put frame a in unit 0 and b in unit 1, reusing whatever is already there.
    function bind(a, b) {
      if (slots[1].idx === a || slots[0].idx === b) slots.reverse();
      if (slots[0].idx !== a) upload(slots[0], a);
      if (b !== a && slots[1].idx !== b) upload(slots[1], b);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, slots[0].t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, slots[1].t);
    }

    // ---- water: atlas on the GPU, a CPU copy to place drops on the water ----
    var water = null;
    var prefix = at(cv.dataset.water);
    if (prefix) {
      Promise.all([
        fetch(prefix + '.json').then(function (r) { if (!r.ok) throw new Error('water.json ' + r.status); return r.json(); }),
        new Promise(function (res, rej) {
          var img = new Image();
          img.onload = function () { res(img); };
          img.onerror = function () { rej(new Error('water atlas')); };
          img.src = prefix + (phone ? '-m' : '-d') + '.webp';
        })
      ]).then(function (r) {
        var meta = r[0], img = r[1], cell = meta.cell[phone ? 'm' : 'd'];
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, maskTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        water = { cols: meta.cols, cw: cell[0], ch: cell[1], w: img.naturalWidth, h: img.naturalHeight,
          px: x.getImageData(0, 0, c.width, c.height).data, cover: [] };
        for (var i = 0; i < N; i++) water.cover[i] = coverOf(i);
        gl.uniform2f(U.uCell, water.cw / water.w, water.ch / water.h);
        state.dirty = true;
      }).catch(function (err) { console.error('[walk] no water mask, still frames only', err); });
    }
    function maskAt(i, u, v) {
      var col = i % water.cols, row = Math.floor(i / water.cols);
      var x = col * water.cw + clamp(Math.round(u * (water.cw - 1)), 0, water.cw - 1);
      var y = row * water.ch + clamp(Math.round(v * (water.ch - 1)), 0, water.ch - 1);
      return water.px[(y * water.w + x) * 4] / 255;
    }
    function coverOf(i) {
      var n = 0;
      for (var v = 0.05; v < 1; v += 0.1) for (var u = 0.05; u < 1; u += 0.1) if (maskAt(i, u, v) > 0.5) n++;
      return n / 100;
    }

    var drops = [], nextDrop = performance.now() + 900;
    function dropOn(i, now) {
      if (now < nextDrop) return;
      nextDrop = now + 1600 + Math.random() * 2600;
      for (var k = 0; k < 16; k++) {
        var u = Math.random(), v = 0.45 + Math.random() * 0.55;
        if (maskAt(i, u, v) > 0.8) {
          drops.push({ u: u, v: v, t0: now, amp: 0.6 + Math.random() * 0.4 });
          if (drops.length > MAX_DROPS) drops.shift();
          return;
        }
      }
    }

    var imgAspect = 16 / 9;
    return {
      reset: function () { gl.viewport(0, 0, cv.width, cv.height); },
      // True while there is water on screen: the pond moves even when scroll is still.
      animated: function (pos) {
        return !!water && water.cover[clamp(Math.round(film(pos)), 0, N - 1)] > 0.005;
      },
      // wet: 0..1, how much the water moves; only at rest (see tick).
      draw: function (pos, now, wet) {
        var f = clamp(film(pos), 0, N - 1);
        var a0 = Math.floor(f), frac = f - a0;
        var a = nearest(a0), b = frac > 0.001 ? nearest(Math.min(a0 + 1, N - 1)) : a;
        if (a < 0) return;
        if (!ready[a0] || !ready[Math.min(a0 + 1, N - 1)]) { b = a; frac = 0; }
        imgAspect = frames[a].naturalWidth / frames[a].naturalHeight;
        bind(a, b);
        var ca = cv.width / cv.height;
        gl.uniform2f(U.uFit, Math.min(1, ca / imgAspect), Math.min(1, imgAspect / ca));
        gl.uniform1f(U.uMix, b === a ? 0 : frac);
        gl.uniform1f(U.uAspect, imgAspect);
        gl.uniform1f(U.uTime, (now / 1000) % 600);
        var shown = frac < 0.5 ? a : b;
        if (water) {
          gl.uniform2f(U.uCellA, (shown % water.cols) * water.cw / water.w, Math.floor(shown / water.cols) * water.ch / water.h);
          gl.uniform1f(U.uHasMask, wet);
          if (wet > 0.5 && water.cover[shown] > 0.005) dropOn(shown, now);
        }
        var buf = new Float32Array(MAX_DROPS * 4);
        drops.forEach(function (d, k) { buf.set([d.u, d.v, (now - d.t0) / 1000, d.amp], k * 4); });
        gl.uniform4fv(U.uDrop, buf);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
  }

  // ------------------------------------------------------------------ frame --
  // Beyond the frames' own resolution a bigger canvas adds GPU work, not detail.
  var MAX_W = phone ? 1400 : hd ? 2880 : 1920;
  function resize() {
    var dpr = Math.min(devicePixelRatio || 1, 2, MAX_W / Math.max(cv.clientWidth, 1));
    cv.width = Math.round(cv.clientWidth * dpr);
    cv.height = Math.round(cv.clientHeight * dpr);
    R.reset();
    state.dirty = true;
  }

  function first() {
    resize();
    state.live = true;
    act.classList.add('is-live');
  }

  function progress() {
    var r = act.getBoundingClientRect();
    var travel = r.height - innerHeight;
    return travel > 0 ? clamp(-r.top / travel, 0, 1) : 0;
  }

  // At rest the playhead settles on a whole frame: between two frames the
  // shader blends them, which reads soft. While moving, the blend keeps it smooth.
  // The water only moves while locked in on a point: it fades in once the film
  // has come to rest and out as soon as it moves again.
  var last = 0, raw = -1, still = 0, wet = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (!state.visible || !state.live || document.hidden) return;
    var r = clamp(progress() / (1 - HOLD), 0, 1) * (N - 1);
    var jumped = raw >= 0 && Math.abs(r - raw) > JUMP_FRAMES;
    if (r !== raw) { raw = r; still = now; }
    state.target = now - still > REST_MS ? Math.round(raw) : raw;
    var d = state.target - state.cur;
    var moving = d !== 0;
    // A jump (the menu) cuts straight to its frame instead of fast-forwarding; a
    // glide, however long, eases. The last hundredth of a frame lands exactly,
    // so a rest is one clean frame.
    state.cur = Math.abs(d) < 0.01 || jumped ? state.target : state.cur + d * LERP;
    var rest = !moving && now - still > REST_MS;
    var water = R.animated && R.animated(state.cur);
    var wetTo = rest && water ? 1 : 0;
    var fading = wet !== wetTo;
    wet = Math.abs(wetTo - wet) < 0.01 ? wetTo : wet + (wetTo - wet) * WET_FADE;
    // Still film and still water: nothing to draw. Still film, moving water: 30 fps.
    if (!moving && !state.dirty && !fading && !(wet > 0 && now - last > 32)) return;
    last = now;
    R.draw(state.cur, now, wet);
    state.dirty = false;
  }

  addEventListener('resize', function () { if (state.live) resize(); });
  new IntersectionObserver(function (e) { state.visible = e[0].isIntersecting; }).observe(act);
  for (var k = 0; k < CONCURRENCY; k++) next();
  requestAnimationFrame(tick);
})();
