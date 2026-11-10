// The planning steps take turns: one is highlighted, the others' titles are
// muted, and every few seconds the next one comes up. Below them a picture
// shows the lit step's first image. Resting the mouse on a step (or on the
// picture) holds that step and plays its images, fading from one to the next.
// A click or tap locks a step (its images keep playing); clicking the locked
// step again unlocks it and the steps take turns again. Only while the list is
// on screen; under reduced motion all stay equal and nothing moves.
//
// Phones do not use the timer. The section is a sticky frame (walk.css) and
// the finger scrubs the same four steps, image by image, then the pin ends
// and the page scrolls on.

const PHASE_MS = 3800;   // how long each step stays highlighted
const SLIDE_MS = 2600;   // how long each image shows while a step is held
const phone = matchMedia('(max-width: 760px)');

export function initPhases(): void {
  const list = document.querySelector<HTMLElement>('.steps');
  if (!list || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const steps = Array.from(list.querySelectorAll<HTMLElement>(':scope > li'));
  if (steps.length < 2) return;
  const stage = document.querySelector<HTMLElement>('.phase-show');
  const sets = stage ? Array.from(stage.querySelectorAll<HTMLElement>('.phase-show__set')) : [];
  const section = document.getElementById('planung');

  let current = 0;
  let cycle = 0;
  let slides = 0;
  let inView = false;
  let held = false;                 // mouse resting on a step or the picture
  let locked: number | null = null; // a step picked by click or tap
  let cleanup = (): void => {};

  // Phones show only the lit step's title, in one line under the row.
  const now = document.createElement('p');
  now.className = 'steps__now';
  now.setAttribute('aria-hidden', 'true');
  list.after(now);

  // Bottom right of the pictures: a ring that fills until the next change.
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('class', 'phase-show__next');
  ring.setAttribute('viewBox', '0 0 24 24');
  ring.innerHTML = '<circle cx="12" cy="12" r="10" pathLength="100"/><circle class="phase-show__fill" cx="12" cy="12" r="10" pathLength="100"/>';
  stage?.append(ring);
  const fill = ring.querySelector<SVGCircleElement>('.phase-show__fill');
  const countdown = (ms: number | null): void => {
    ring.classList.remove('is-running');
    if (ms === null) return;
    ring.style.setProperty('--next', `${ms}ms`);
    void ring.getBoundingClientRect();   // restart the fill from empty
    ring.classList.add('is-running');
  };

  const picture = (i: number): void => {
    const set = sets[current];
    if (!set) return;
    const imgs = Array.from(set.querySelectorAll('img'));
    imgs.forEach((img, k) => img.classList.toggle('is-on', k === i % imgs.length));
  };
  const show = (i: number): void => {
    current = i;
    steps.forEach((li, k) => {
      li.classList.toggle('is-active', k === i);
      li.classList.toggle('is-locked', k === locked);
    });
    sets.forEach((set, k) => set.classList.toggle('is-active', k === i));
    now.textContent = steps[i]?.querySelector('h3')?.textContent ?? '';
    picture(0);
  };

  const stopCycle = (): void => { clearInterval(cycle); cycle = 0; countdown(null); };
  const startCycle = (): void => {
    stopCycle();
    if (!inView || held || locked !== null) return;
    countdown(PHASE_MS);
    cycle = window.setInterval(() => { show((current + 1) % steps.length); countdown(PHASE_MS); }, PHASE_MS);
  };
  const stopSlides = (): void => { clearInterval(slides); slides = 0; countdown(null); };
  const startSlides = (): void => {
    stopSlides();
    let n = 0;
    countdown(SLIDE_MS);
    slides = window.setInterval(() => { picture(++n); countdown(SLIDE_MS); }, SLIDE_MS);
  };

  // Hover: a passing hold, ignored while a step is locked.
  const hold = (i: number): void => {
    if (locked !== null) return;
    held = true; stopCycle(); show(i); startSlides();
  };
  const release = (): void => {
    if (locked !== null || !held) return;
    held = false; stopSlides(); picture(0); startCycle();
  };
  // Click or tap: lock a step (its pictures play); the locked one again unlocks.
  const toggleLock = (i: number): void => {
    if (locked === i) {
      locked = null; held = false;
      stopSlides(); show(i); startCycle();
      return;
    }
    locked = i; stopCycle(); show(i); startSlides();
  };

  const frames = sets.map((set) => Array.from(set.querySelectorAll('img')));

  // 0 when the sticky frame pins, 1 as it lets go. The track and the frame
  // are both svh, so the address bar does not move this ruler.
  const scrubProgress = (): number => {
    if (!section) return 0;
    const frame = section.querySelector('.sheet__inner');
    const travel = section.offsetHeight - (frame?.getBoundingClientRect().height || innerHeight);
    if (travel <= 1) return 0;
    return Math.min(1, Math.max(0, (scrollY - section.offsetTop) / travel));
  };
  const renderScrub = (): void => {
    const flat = frames.flat();
    if (!flat.length) return;
    const x = scrubProgress() * (flat.length - 1);
    const i0 = Math.floor(x);
    const i1 = Math.min(flat.length - 1, i0 + 1);
    const blend = x - i0;
    flat.forEach((img, k) => {
      let opacity = 0;
      if (k === i0) opacity = 1 - (i0 === i1 ? 0 : blend);
      if (k === i1) opacity = Math.max(opacity, i0 === i1 ? 1 : blend);
      img.style.opacity = opacity.toFixed(3);
    });
    const phaseCount = Math.max(1, frames.length);
    const phase = Math.min(phaseCount - 1, Math.floor(scrubProgress() * phaseCount));
    const local = scrubProgress() * phaseCount - phase;
    show(phase);
    if (fill) fill.style.strokeDashoffset = String(100 - Math.min(1, local) * 100);
  };

  const mountScrub = (): void => {
    section?.classList.add('is-scrub');
    stage?.classList.add('is-scrub');
    list.classList.add('is-cycling');
    locked = null;
    held = false;
    stopCycle();
    stopSlides();
    ring.classList.remove('is-running');
    const onScroll = (): void => renderScrub();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    renderScrub();
    cleanup = () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      section?.classList.remove('is-scrub');
      stage?.classList.remove('is-scrub');
      frames.flat().forEach((img) => img.style.removeProperty('opacity'));
      if (fill) fill.style.removeProperty('stroke-dashoffset');
    };
  };

  const mountCycle = (): void => {
    list.classList.add('is-cycling');
    show(0);
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      if (inView) startCycle(); else { stopCycle(); release(); }
    }, { threshold: 0.3 });
    io.observe(list);

    const isMouse = (e: PointerEvent): boolean => e.pointerType === 'mouse';
    const bound = steps.map((li, i) => {
      const enter = (e: PointerEvent): void => { if (isMouse(e)) hold(i); };
      const leave = (e: PointerEvent): void => { if (isMouse(e)) release(); };
      const click = (): void => toggleLock(i);
      li.addEventListener('pointerenter', enter);
      li.addEventListener('pointerleave', leave);
      li.addEventListener('click', click);
      return { li, enter, leave, click };
    });
    const stageEnter = (e: PointerEvent): void => { if (isMouse(e)) hold(current); };
    const stageLeave = (e: PointerEvent): void => { if (isMouse(e)) release(); };
    stage?.addEventListener('pointerenter', stageEnter);
    stage?.addEventListener('pointerleave', stageLeave);

    cleanup = () => {
      io.disconnect();
      stopCycle();
      stopSlides();
      bound.forEach(({ li, enter, leave, click }) => {
        li.removeEventListener('pointerenter', enter);
        li.removeEventListener('pointerleave', leave);
        li.removeEventListener('click', click);
      });
      stage?.removeEventListener('pointerenter', stageEnter);
      stage?.removeEventListener('pointerleave', stageLeave);
    };
  };

  const apply = (): void => {
    cleanup();
    if (phone.matches && section) mountScrub();
    else mountCycle();
  };
  phone.addEventListener('change', apply);
  apply();
}
