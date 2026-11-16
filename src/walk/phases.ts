// The planning steps take turns: one is highlighted, the others' titles are
// muted, and every few seconds the next one comes up. Below them a picture
// shows the lit step's first image. Resting the mouse on a step (or on the
// picture) holds that step and plays its images, fading from one to the next.
// A click or tap locks a step (its images keep playing); clicking the locked
// step again unlocks it and the steps take turns again. Only while the list is
// on screen; under reduced motion all stay equal and nothing moves.
//
// Phones do not use the timer. The four steps are a horizontal carousel: one
// card per step, and the picture below follows the card that is in view.
// A sideways swipe stays in the carousel and does not move the page.

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

  const mountCarousel = (): void => {
    section?.classList.add('is-carousel-on');
    list.classList.add('is-carousel');
    now.hidden = true;
    show(0);
    const hint = document.querySelector('.steps-hint');
    const dots = document.createElement('div');
    dots.className = 'steps-dots';
    dots.setAttribute('aria-hidden', 'true');
    const marks = steps.map(() => {
      const mark = document.createElement('span');
      dots.append(mark);
      return mark;
    });
    hint?.after(dots);
    const paint = (): void => {
      const width = list.clientWidth || 1;
      const index = Math.max(0, Math.min(steps.length - 1, Math.round(list.scrollLeft / width)));
      show(index);
      marks.forEach((mark, i) => mark.classList.toggle('is-on', i === index));
    };
    const dismiss = (): void => hint?.classList.add('is-gone');
    let originX = 0;
    let originLeft = 0;
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let velX = 0;
    let startIndex = 0;
    const cardWidth = (): number => list.clientWidth || 1;
    const glideCard = (left: number, ms: number): void => {
      const from = list.scrollLeft;
      const delta = left - from;
      const t0 = performance.now();
      const tick = (now: number): void => {
        const t = Math.min(1, (now - t0) / ms);
        const eased = 1 - Math.pow(1 - t, 3);
        list.scrollLeft = from + delta * eased;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const onTouchStart = (event: TouchEvent): void => {
      dragging = true;
      originX = event.touches[0]?.clientX ?? 0;
      originLeft = list.scrollLeft;
      lastX = originX;
      lastT = performance.now();
      velX = 0;
      startIndex = Math.round(originLeft / cardWidth());
    };
    const onTouchMove = (event: TouchEvent): void => {
      if (!dragging) return;
      const x = event.touches[0]?.clientX ?? lastX;
      const now = performance.now();
      velX = (lastX - x) / Math.max(1, now - lastT);
      lastX = x;
      lastT = now;
      const dx = originX - x;
      if (Math.abs(dx) < 6) return;
      event.preventDefault();
      list.scrollLeft = originLeft + dx;
    };
    const onTouchEnd = (): void => {
      if (!dragging) return;
      dragging = false;
      const width = cardWidth();
      const flick = Math.abs(velX) > 0.45;
      let index = flick ? startIndex + (velX > 0 ? 1 : -1) : Math.round(list.scrollLeft / width);
      index = Math.max(startIndex - 1, Math.min(startIndex + 1, index));
      index = Math.max(0, Math.min(steps.length - 1, index));
      glideCard(index * width, Math.abs(velX) > 0.9 ? 220 : 320);
      dismiss();
    };
    list.addEventListener('scroll', paint, { passive: true });
    list.addEventListener('touchstart', onTouchStart, { passive: true });
    list.addEventListener('touchmove', onTouchMove, { passive: false });
    list.addEventListener('touchend', onTouchEnd);
    list.addEventListener('touchcancel', onTouchEnd);
    paint();
    cleanup = () => {
      list.removeEventListener('scroll', paint);
      list.removeEventListener('touchstart', onTouchStart);
      list.removeEventListener('touchmove', onTouchMove);
      list.removeEventListener('touchend', onTouchEnd);
      list.removeEventListener('touchcancel', onTouchEnd);
      dots.remove();
      now.hidden = false;
      section?.classList.remove('is-carousel-on');
      list.classList.remove('is-carousel');
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
    if (phone.matches && section) mountCarousel();
    else mountCycle();
  };
  phone.addEventListener('change', apply);
  apply();
}
