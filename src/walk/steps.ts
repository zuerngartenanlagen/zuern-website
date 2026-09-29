// Point-to-point walking, and the dot navigation on phones.
//
// Inside the pinned walk the page rests only at points: the opening, each
// service card at the middle of its hold, and the arrival. When scrolling
// comes to rest between two points, it glides on to the next one in the
// direction you were going and stays there. A wheel notch or a flick moves one
// point. Past the arrival you leave the walk into the sections, which scroll
// freely. The dots (phones only, see walk.css) show where you are and jump.
import type Lenis from 'lenis';

interface Point {
  label: string;
  y: () => number;
  inWalk: boolean;
}

const REST_MS = 140;        // no scroll for this long = the gesture has ended
const GLIDE_S = 1.1;        // seconds to glide to the next point
const NEAR_PX = 6;          // already at a point

const ease = (t: number): number => 1 - Math.pow(1 - t, 3);

function windowOf(el: Element): number[] {
  return (el.getAttribute('data-g-window') ?? '').split(/\s+/).map(Number);
}

function collectPoints(act: HTMLElement): Point[] {
  // Scroll position of a progress value p inside the pinned walk.
  const at = (p: number) => (): number => act.offsetTop + p * (act.offsetHeight - innerHeight);
  const points: Point[] = [{ label: 'Start', y: at(0), inWalk: true }];

  act.querySelectorAll('.stop').forEach((stop) => {
    const w = windowOf(stop);
    const hold = ((w[1] ?? 0) + (w[2] ?? 0)) / 2;
    const title = stop.querySelector('h2, h3')?.textContent?.trim() ?? 'Leistung';
    points.push({ label: title, y: at(hold), inWalk: true });
  });

  const arrive = act.querySelector('.garden__arrive');
  if (arrive) {
    const w = windowOf(arrive);
    points.push({ label: arrive.querySelector('h2')?.textContent?.trim() ?? 'Ankommen', y: at(Math.min(1, (w[1] ?? 0.9) + 0.05)), inWalk: true });
  }

  ['planung', 'ueber-mich', 'kontakt'].forEach((id) => {
    const section = document.getElementById(id);
    const title = section?.querySelector('h2')?.textContent?.trim();
    if (section && title) points.push({ label: title, y: () => section.offsetTop, inWalk: false });
  });
  return points;
}

function scrollToY(lenis: Lenis | null, y: number, onDone?: () => void): void {
  if (lenis) {
    lenis.scrollTo(y, { duration: GLIDE_S, easing: ease, onComplete: () => onDone?.() });
  } else {
    scrollTo({ top: y, behavior: 'instant' });
    onDone?.();
  }
}

function buildDots(points: Point[], go: (i: number) => void): HTMLButtonElement[] {
  const nav = document.createElement('nav');
  nav.className = 'dots';
  nav.setAttribute('aria-label', 'Abschnitte');
  const dots = points.map((pt, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dots__dot';
    b.setAttribute('aria-label', pt.label);
    b.addEventListener('click', () => go(i));
    nav.append(b);
    return b;
  });
  document.body.append(nav);
  return dots;
}

export function initSteps(lenis: Lenis | null): void {
  const act = document.querySelector<HTMLElement>('[data-walk]');
  if (!act) return;
  const points = collectPoints(act);
  const walk = points.filter((pt) => pt.inWalk);
  const firstSection = points.find((pt) => !pt.inWalk);

  let gliding = false;
  let lastY = scrollY;
  let dir = 0;
  let restTimer = 0;

  const go = (i: number): void => {
    const pt = points[i];
    if (!pt) return;
    gliding = true;
    scrollToY(lenis, pt.y(), () => { gliding = false; lastY = scrollY; });
  };
  const dots = buildDots(points, go);

  function markActive(): void {
    let best = 0;
    points.forEach((pt, i) => { if (scrollY >= pt.y() - innerHeight * 0.35) best = i; });
    dots.forEach((d, i) => d.toggleAttribute('aria-current', i === best));
  }

  // Scrolling has come to rest: settle on a point if we are inside the walk.
  function settle(): void {
    if (gliding || !lenis) return;
    const y = scrollY;
    // The stepping zone runs from the opening to the top of the first section;
    // the gap after the arrival steps too, so nobody is left between the two.
    const stops = firstSection ? [...walk, firstSection] : walk;
    const start = stops[0]?.y() ?? 0;
    const end = stops[stops.length - 1]?.y() ?? 0;
    if (y < start - NEAR_PX || y >= end - NEAR_PX) return;       // outside: free
    if (stops.some((pt) => Math.abs(pt.y() - y) <= NEAR_PX)) return;
    const target = dir >= 0
      ? stops.find((pt) => pt.y() > y)?.y()
      : [...stops].reverse().find((pt) => pt.y() < y)?.y();
    if (target === undefined) return;
    gliding = true;
    scrollToY(lenis, target, () => { gliding = false; lastY = scrollY; });
  }

  function onScroll(): void {
    const y = scrollY;
    if (Math.abs(y - lastY) > 0.5) dir = Math.sign(y - lastY);
    lastY = y;
    markActive();
    clearTimeout(restTimer);
    restTimer = window.setTimeout(settle, REST_MS);
  }

  addEventListener('scroll', onScroll, { passive: true });
  // A new touch or wheel takes over from a glide in progress.
  const interrupt = (): void => { gliding = false; };
  addEventListener('touchstart', interrupt, { passive: true });
  addEventListener('wheel', interrupt, { passive: true });
  markActive();
}
