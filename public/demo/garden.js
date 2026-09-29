/* ============================================================================
   Schritt in den Garten: the walk-in hero.

   One WebGL quad renders the whole scene:
     ground   one continuous photo, displaced per pixel by its depth map. A short
              ray-march from the vanishing point finds the nearest surface, so
              near ground really does occlude far ground as the camera advances.
     cards    castle, tree, boulder, reeds: RGBA cutouts, each at one depth.
              Depth-tested against the ground, so planting in front of the
              castle's terrace still covers its base.
     ripples  every step that lands on the pond sends out a ring, in plate
              space, so it travels and scales with the water.

   Swap the castle: replace assets/castle.webp (RGBA) or point data-castle at a
   new file, and adjust its rect/depth in assets/layers.json. See README.md.

   Scroll progress comes from the pinned act (engine-owned pin). Copy windows are
   driven from the same progress. Under reduced motion nothing here runs: the
   poster and static copy hold.
   ========================================================================== */
(function () {
  'use strict';

  var act = document.querySelector('[data-garden]');
  if (!act) return;
  var canvas = act.querySelector('.garden__gl');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  // ---------------------------------------------------------------- tuning --
  var EPS = 0.1;          // depth -> distance: D = 1 / (EPS + depth)
  var CAM_MAX = 1.3;      // how far the camera walks (house ends about 1.8x)
  var STEP = 0.155;       // camera units per footstep
  var WALK = [0.06, 0.76];// progress window of the walk; the rest is arrival
  var VP_FROM = [0.60, 0.47], VP_TO = [0.735, 0.45]; // heading: path -> door
  var MAX_RIPPLES = 6;
  var TAU_MARCH = 40;     // ray-march steps, shader and CPU alike

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var mix = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return t * t * (3 - 2 * t); };
  var easeInOut = function (t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); };

  // ---------------------------------------------------------- copy windows --
  // data-g-window="in0 in1 out0 out1" in act progress. Omit out for "stays".
  var copies = [].slice.call(act.querySelectorAll('[data-g-window]')).map(function (el) {
    return { el: el, w: el.getAttribute('data-g-window').split(/\s+/).map(Number) };
  });
  var rail = document.querySelector('[data-g-rail]');

  function copyAt(p) {
    copies.forEach(function (c) {
      var w = c.w;
      var o = w[0] === w[1] ? (p >= w[0] ? 1 : 0) : ease(clamp((p - w[0]) / (w[1] - w[0]), 0, 1));
      var out = w.length > 2 ? ease(clamp((p - w[2]) / (w[3] - w[2]), 0, 1)) : 0;
      var vis = o * (1 - out);
      c.el.style.opacity = vis.toFixed(3);
      c.el.style.transform = 'translate3d(0,' + ((1 - o) * 18 - out * 26).toFixed(1) + 'px,0)';
      c.el.classList.toggle('is-hidden', vis < 0.02);
    });
    if (rail) rail.classList.toggle('is-away', p > 0.07 && p < 0.84);
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

  // The small top-left logo: on once the opening logo has gone, light or dark
  // variant from whichever [data-theme] section sits under it.
  var brand = document.querySelector('[data-g-brand]');
  var themed = [].slice.call(document.querySelectorAll('[data-theme]'));
  function brandAt() {
    if (!brand) return;
    var p = progress();
    var past = reduce ? scrollY > innerHeight * 0.6 : (p > 0.24 || act.getBoundingClientRect().bottom < innerHeight);
    brand.classList.toggle('is-on', past);
    var y = brand.getBoundingClientRect().top + brand.offsetHeight / 2;
    var under = themed.filter(function (s) { var r = s.getBoundingClientRect(); return r.top <= y && r.bottom > y; })[0];
    brand.classList.toggle('on-light', !!under && under.getAttribute('data-theme') === 'light');
    // Solid patina over the dark sheet; over the film the tile stays translucent.
    brand.classList.toggle('on-dark', !!under && under !== act && under.getAttribute('data-theme') === 'dark');
  }
  addEventListener('scroll', brandAt, { passive: true });
  addEventListener('resize', brandAt);
  brandAt();

  if (reduce) {
    root.classList.add('g-still');
    return;
  }

  // Copy runs even when WebGL is unavailable: the poster holds the scene.
  var gl = canvas && canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: 'high-performance'
  });

  var state = { p: -1, ripples: [], lastStep: 0, visible: true, dirty: true };
  var ready = false, U = {}, cpu = {}, layers;

  function loop() {
    var p = progress();
    if (p !== state.p) { state.p = p; state.dirty = true; copyAt(p); }
    if (ready) frame();
    requestAnimationFrame(loop);
  }
  copyAt(progress());
  requestAnimationFrame(loop);
  if (!gl) return;

  // ---------------------------------------------------------------- shader --
  var VERT = 'attribute vec2 a;varying vec2 vUv;void main(){vUv=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uGround,uDepth,uWater,uC0,uC1,uC2,uC3;',
    'uniform vec4 uR0,uR1,uR2,uR3;',
    'uniform vec4 uDep;',
    'uniform vec2 uF,uSpan,uVP;',
    'uniform float uCam,uEps,uTime,uAspect,uBob,uView;',
    'uniform vec4 uRip[' + MAX_RIPPLES + '];',
    'const int N=' + TAU_MARCH + ';',
    'float tOf(float d){return 1.0-uCam*(uEps+d);}',
    // A card is a flat cutout at one depth, hidden where nearer ground covers it.
    'vec4 card(sampler2D tex,vec4 r,float dep,vec2 dir,float dG){',
    '  float t=tOf(dep); if(t<=0.03) return vec4(0.);',
    '  vec2 l=(uVP+dir*t-r.xy)/r.zw;',
    '  if(l.x<0.||l.y<0.||l.x>1.||l.y>1.) return vec4(0.);',
    '  vec4 c=texture2D(tex,l);',
    '  c.a*=smoothstep(.1,.32,t)*smoothstep(-.035,.01,dep-dG);',
    '  return c;',
    '}',
    'void main(){',
    '  vec2 p=uF+(vUv-.5)*uSpan+vec2(0.,uBob);',
    '  vec2 dir=p-uVP;',
    // March outward from the vanishing point; the first crossing is the nearest surface.
    '  float lo=0.,hi=1.;',
    '  for(int i=1;i<=N;i++){',
    '    float t=float(i)/float(N);',
    '    if(tOf(texture2D(uDepth,uVP+dir*t).r)-t<=0.){hi=t;break;}',
    '    lo=t;',
    '  }',
    // Bisect the bracket: coarse steps alone band near surfaces into ripples.
    '  for(int j=0;j<6;j++){',
    '    float m=(lo+hi)*.5;',
    '    if(tOf(texture2D(uDepth,uVP+dir*m).r)-m>0.) lo=m; else hi=m;',
    '  }',
    '  float th=(lo+hi)*.5;',
    '  vec2 q=uVP+dir*th;',
    '  float dG=texture2D(uDepth,q).r;',
    '  float w=texture2D(uWater,q).r;',
    '  vec2 disp=vec2(0.);float hl=0.;',
    '  if(w>.004){',
    '    for(int k=0;k<' + MAX_RIPPLES + ';k++){',
    '      vec4 R=uRip[k]; if(R.w<=0.) continue;',
    '      vec2 d=(q-R.xy)*vec2(uAspect,uAspect*2.6);',  // flattened: the pond is foreshortened
    '      float r=length(d),rad=R.z*.085;',
    '      float ring=exp(-pow((r-rad)*24.,2.));',
    '      float env=R.w*exp(-R.z*.75)*smoothstep(0.,.15,R.z);',
    '      float wave=sin((r-rad)*230.)*ring*env;',
    '      disp+=d/max(r,1e-4)*wave*.0035;hl+=wave;',
    '    }',
    '    disp+=vec2(sin(q.y*210.+uTime*1.1),cos(q.x*160.-uTime*.9))*.00045;',
    '    disp.y/=2.6;',
    '  }',
    '  vec3 col=texture2D(uGround,q+disp*w).rgb+vec3(.9,.92,.88)*hl*.05*w;',
    '  if(uView>1.5){gl_FragColor=vec4(vec3(dG),1.);return;}',
    '  if(uView>.5){gl_FragColor=vec4(col,1.);return;}',
    '  vec4 c;',
    '  c=card(uC1,uR1,uDep.y,dir,dG); col=mix(col,c.rgb,c.a);',  // tree
    '  c=card(uC0,uR0,uDep.x,dir,dG); col=mix(col,c.rgb,c.a);',  // castle
    '  c=card(uC2,uR2,uDep.z,dir,dG); col=mix(col,c.rgb,c.a);',  // boulder
    '  c=card(uC3,uR3,uDep.w,dir,dG); col=mix(col,c.rgb,c.a);',  // reeds
    '  gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    console.error('[garden] shader failed, poster holds', err);
    return;
  }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  ['uGround', 'uDepth', 'uWater', 'uC0', 'uC1', 'uC2', 'uC3', 'uR0', 'uR1', 'uR2', 'uR3', 'uDep',
    'uF', 'uSpan', 'uVP', 'uCam', 'uEps', 'uTime', 'uAspect', 'uBob', 'uRip', 'uView'].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  // ---------------------------------------------------------------- assets --
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('failed to load ' + src)); };
      img.src = src;
    });
  }

  function texture(unit, img) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // CPU copies of depth and water, to place footsteps on the real surface.
  function pixels(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
  }
  function sample(px, u, v) {
    var x = clamp(Math.round(u * (px.w - 1)), 0, px.w - 1);
    var y = clamp(Math.round(v * (px.h - 1)), 0, px.h - 1);
    return px.d[(y * px.w + x) * 4] / 255;
  }

  var ds = canvas.dataset;
  fetch(ds.layers)
    .then(function (r) { if (!r.ok) throw new Error('layers.json ' + r.status); return r.json(); })
    .then(function (json) {
      layers = json.layers;
      return Promise.all([ds.ground, ds.depth, ds.water, ds.castle, ds.tree, ds.boulder, ds.reeds].map(loadImage));
    })
    .then(function (imgs) {
      var aspect = imgs[0].naturalWidth / imgs[0].naturalHeight;
      imgs.forEach(function (img, i) { texture(i, img); });
      ['uGround', 'uDepth', 'uWater', 'uC0', 'uC1', 'uC2', 'uC3'].forEach(function (n, i) { gl.uniform1i(U[n], i); });
      ['castle', 'tree', 'boulder', 'reeds'].forEach(function (n, i) { gl.uniform4fv(U['uR' + i], layers[n].rect); });
      gl.uniform4f(U.uDep, layers.castle.depth, layers.tree.depth, layers.boulder.depth, layers.reeds.depth);
      gl.uniform1f(U.uEps, EPS);
      gl.uniform1f(U.uAspect, aspect);
      // Dev aid: ?view=ground hides the cards, ?view=depth shows the ground depth hit.
      gl.uniform1f(U.uView, { ground: 1, depth: 2 }[new URLSearchParams(location.search).get('view')] || 0);
      cpu = { depth: pixels(imgs[1]), water: pixels(imgs[2]), aspect: aspect };
      resize();
      ready = true;
      state.dirty = true;
      frame();
      act.classList.add('is-live');
    })
    .catch(function (err) { console.error('[garden] assets failed, poster holds', err); });

  // ------------------------------------------------------------------ view --
  var view = { w: 1, h: 1, portrait: false };
  function resize() {
    var dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.5 : 1.75);
    var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w === canvas.width && h === canvas.height && view.w === w) return;
    canvas.width = w; canvas.height = h;
    view = { w: w, h: h, portrait: w / h < 1 };
    gl.viewport(0, 0, w, h);
    state.dirty = true;
  }
  addEventListener('resize', function () { if (ready) resize(); });

  // Cover-fit the plate, focused on F, zoomed a touch so the step bob never shows an edge.
  function framing(e) {
    var a = cpu.aspect, v = view.w / view.h, zoom = 1.035;
    var span = v >= a ? [1, a / v] : [v / a, 1];
    span = [span[0] / zoom, span[1] / zoom];
    var fx = view.portrait ? mix(0.5, 0.76, e) : mix(0.5, 0.56, e);
    return { f: [clamp(fx, span[0] / 2, 1 - span[0] / 2), 0.5], span: span };
  }

  // Screen point -> ground point, same march as the shader, for footsteps.
  function groundAt(sx, sy, fr, vp, cam) {
    var p = [fr.f[0] + (sx - 0.5) * fr.span[0], fr.f[1] + (sy - 0.5) * fr.span[1]];
    var dir = [p[0] - vp[0], p[1] - vp[1]];
    var tOf = function (d) { return 1 - cam * (EPS + d); };
    var tp = 0, fp = tOf(sample(cpu.depth, vp[0], vp[1])), th = 1;
    for (var i = 1; i <= TAU_MARCH; i++) {
      var t = i / TAU_MARCH, f = tOf(sample(cpu.depth, vp[0] + dir[0] * t, vp[1] + dir[1] * t)) - t;
      if (f <= 0) { th = tp + (t - tp) * fp / Math.max(fp - f, 1e-5); break; }
      tp = t; fp = f;
    }
    return [vp[0] + dir[0] * th, vp[1] + dir[1] * th];
  }

  function ripple(x, y, amp) {
    state.ripples.push({ x: x, y: y, t0: performance.now(), amp: amp });
    if (state.ripples.length > MAX_RIPPLES) state.ripples.shift();
  }

  // A drop now and then, so the pond is never a still photograph.
  var nextDrop = performance.now() + 1800;
  function ambientDrop(now) {
    if (now < nextDrop) return;
    nextDrop = now + 3800 + Math.random() * 3200;
    for (var i = 0; i < 12; i++) {
      var u = 0.2 + Math.random() * 0.45, v = 0.8 + Math.random() * 0.18;
      if (sample(cpu.water, u, v) > 0.7) { ripple(u, v, 0.45); return; }
    }
  }

  new IntersectionObserver(function (e) { state.visible = e[0].isIntersecting; }).observe(act);

  var lastDraw = 0;
  function frame() {
    var now = performance.now();
    if (!state.visible || document.hidden) return;
    var rippling = state.ripples.some(function (r) { return now - r.t0 < 5000; });
    // Idle pond: 30fps is plenty for the shimmer. Scrolling or rippling: every frame.
    if (!state.dirty && !rippling && now - lastDraw < 33) return;
    lastDraw = now;
    ambientDrop(now);

    var p = Math.max(state.p, 0);
    var e = easeInOut(clamp((p - WALK[0]) / (WALK[1] - WALK[0]), 0, 1));
    var cam = CAM_MAX * e;
    var vp = [mix(VP_FROM[0], VP_TO[0], e), mix(VP_FROM[1], VP_TO[1], e)];
    var fr = framing(e);

    // Footsteps: every STEP of travel lands a foot, alternating; on water it ripples.
    var step = Math.floor(cam / STEP);
    if (step !== state.lastStep) {
      var g = groundAt(step % 2 ? 0.42 : 0.54, 0.9, fr, vp, cam);
      if (sample(cpu.water, g[0], g[1]) > 0.5) ripple(g[0], g[1], 1);
      state.lastStep = step;
    }
    var settle = 1 - ease(clamp((e - 0.9) / 0.1, 0, 1));
    var bob = -Math.abs(Math.sin(Math.PI * cam / STEP)) * 0.0028 * Math.min(1, cam * 6) * settle;

    gl.uniform2fv(U.uF, fr.f);
    gl.uniform2fv(U.uSpan, fr.span);
    gl.uniform2fv(U.uVP, vp);
    gl.uniform1f(U.uCam, cam);
    gl.uniform1f(U.uBob, bob);
    gl.uniform1f(U.uTime, now / 1000);
    var rip = new Float32Array(MAX_RIPPLES * 4);
    state.ripples.forEach(function (r, i) { rip.set([r.x, r.y, (now - r.t0) / 1000, r.amp], i * 4); });
    gl.uniform4fv(U.uRip, rip);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    state.dirty = false;
  }
})();
