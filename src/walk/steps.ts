// Point-to-point walking, and the dot navigation on phones.
//
// Inside the walk the page never rests between points: the opening, each
// service card at the middle of its hold, the arrival, and the top of the
// first section. Scrolling is held there (Lenis stopped) and every gesture
// (a wheel or trackpad swipe, a touch swipe, an arrow key) glides exactly one
// point on. Past the last point the sections scroll freely; scrolling back up
// into the walk lands on the nearest point and stepping resumes. The dots
// (phones only, see walk.css) show where you are and jump. Without Lenis
// (reduced motion) nothing is held and the dots jump instantly.
import type Lenis from 'lenis';

interface Point {
  label: string;
  y: () => number;
  inWalk: boolean;
}

const GLIDE_S = 1.1;          // seconds to glide to the next point
const WHEEL_MIN = 12;         // ignore tiny wheel jitter (px)
const WHEEL_QUIET_MS = 220;   // a pause this long ends a wheel/trackpad gesture
const SWIPE_MIN = 40;         // touch travel that counts as a swipe (px)

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
  const firstSection = points.findIndex((pt) => !pt.inWalk);
  // The stepping zone: every walk point plus the top of the first section.
  const zone = points.slice(0, firstSection < 0 ? points.length : firstSection + 1);
  const zoneEnd = (): number => zone[zone.length - 1]?.y() ?? 0;
  const inZoneNow = (): boolean => scrollY <= zoneEnd() + 2;
  const atZoneEnd = (): boolean => scrollY >= zoneEnd() - 2;

  let gliding = false;
  let held = false;
  let pointBefore = 0;       // the point we rest on, for resizes

  const hold = (on: boolean): void => {
    if (!lenis || on === held) return;
    held = on;
    if (on) lenis.stop(); else lenis.start();
  };

  // Index of the zone point nearest to the current scroll position.
  const nearestZone = (): number => {
    let best = 0;
    zone.forEach((pt, i) => { if (Math.abs(pt.y() - scrollY) < Math.abs((zone[best]?.y() ?? 0) - scrollY)) best = i; });
    return best;
  };

  const dots = buildDots(points, (i) => { const pt = points[i]; if (pt) glideTo(pt.y()); });

  function markActive(): void {
    let best = 0;
    points.forEach((pt, i) => { if (scrollY >= pt.y() - innerHeight * 0.35) best = i; });
    dots.forEach((d, i) => d.toggleAttribute('aria-current', i === best));
  }

  function glideTo(y: number): void {
    if (!lenis) { scrollTo({ top: y, behavior: 'instant' }); markActive(); return; }
    const inZone = y <= zoneEnd() + 1;
    gliding = true;
    hold(true);
    lenis.scrollTo(y, {
      duration: GLIDE_S, easing: ease, force: true,
      onComplete: () => { gliding = false; pointBefore = nearestZone(); hold(inZone); markActive(); },
    });
  }

  function step(dir: 1 | -1): void {
    if (gliding) return;
    const next = zone[nearestZone() + dir];
    if (next) glideTo(next.y());
    else if (dir > 0) hold(false);            // down from the last point: let go
  }

  if (!lenis) {
    addEventListener('scroll', markActive, { passive: true });
    markActive();
    return;
  }

  // Wheel and trackpad: one gesture, one point. A gesture ends after a pause,
  // so a trackpad's long momentum tail does not count as new swipes.
  let lastWheel = 0;
  let stepped = false;
  addEventListener('wheel', (e: WheelEvent) => {
    if (!inZoneNow() || (e.deltaY > 0 && atZoneEnd() && !gliding)) { hold(false); return; }
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheel > WHEEL_QUIET_MS) stepped = false;
    lastWheel = now;
    if (stepped || Math.abs(e.deltaY) < WHEEL_MIN) return;
    stepped = true;
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // Touch: a swipe steps; the page does not move under the finger.
  let touchY: number | null = null;
  addEventListener('touchstart', (e: TouchEvent) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
  addEventListener('touchmove', (e: TouchEvent) => {
    if (!inZoneNow() || touchY === null) return;
    const dy = touchY - (e.touches[0]?.clientY ?? touchY);
    if (dy > 0 && atZoneEnd() && !gliding) { hold(false); return; }   // leaving downward
    e.preventDefault();
  }, { passive: false });
  addEventListener('touchend', (e: TouchEvent) => {
    if (touchY === null) return;
    const dy = touchY - (e.changedTouches[0]?.clientY ?? touchY);
    touchY = null;
    if (!inZoneNow() || Math.abs(dy) < SWIPE_MIN || (dy > 0 && atZoneEnd())) return;
    step(dy > 0 ? 1 : -1);
  }, { passive: true });

  addEventListener('keydown', (e: KeyboardEvent) => {
    if (!inZoneNow() || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const down = ['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
    const up = ['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
    if (!down && !up) return;
    if (down && atZoneEnd()) { hold(false); return; }
    e.preventDefault();
    step(down ? 1 : -1);
  });

  // In-page links (rail, logo, skip link) glide too, and work while held.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
    if (!(a instanceof HTMLAnchorElement)) return;
    const id = a.hash.slice(1);
    const el = id ? document.getElementById(id) : null;
    if (!el && id !== 'top') return;
    e.preventDefault();
    const y = id === 'top' || !el ? 0 : el.getBoundingClientRect().top + scrollY;
    // A link into the walk lands on its nearest point.
    const target = y <= zoneEnd() + 2
      ? zone.reduce((b, pt) => (Math.abs(pt.y() - y) < Math.abs(b - y) ? pt.y() : b), zone[0]?.y() ?? 0)
      : y;
    glideTo(target);
  });

  // Free scrolling back up into the walk: land on the nearest point and hold.
  lenis.on('scroll', () => {
    markActive();
    if (!held && !gliding && scrollY < zoneEnd() - 2) {
      const pt = zone[Math.min(nearestZone(), zone.length - 2)];
      if (pt) glideTo(pt.y());
    }
  });

  // A resize or rotation re-lays out the walk: stay on the same point.
  // While held the page only moves by gliding, so only free scrolling updates it;
  // a resize itself can reset the scroll position and must not count.
  let resizeTimer = 0;
  pointBefore = nearestZone();
  addEventListener('scroll', () => { if (!held && !gliding) pointBefore = nearestZone(); }, { passive: true });
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const pt = zone[pointBefore];
      if (held && pt) lenis.scrollTo(pt.y(), { immediate: true, force: true });
      markActive();
    }, 150);
  });

  hold(inZoneNow());
  markActive();
}
