// Point-to-point walking, and the dot navigation.
//
// Inside the walk the page never rests between points: the opening, each
// service card at the middle of its hold, the arrival, and the top of the
// first section. Scrolling is held there (Lenis stopped) and every gesture (a
// wheel or trackpad swipe, a touch swipe, a page key) glides exactly one point
// on. Past the last point the sections scroll freely; scrolling back up into
// the walk lands on the nearest point and stepping resumes.
//
// The arrow keys and the up/down tab at the right edge step one point on or
// back anywhere on the page, sections included, gliding. The menu jumps
// straight to its target; the dots glide on large screens and jump on phones.
// The dots show where you are: on phones one per point, always; on large
// screens, where the rail already covers the sections, one per service, while
// on a service. Without Lenis (reduced motion) nothing is held.
import type Lenis from 'lenis';

interface Point {
  label: string;
  y: () => number;
  inWalk: boolean;
  isService?: boolean;
  card?: HTMLElement;
}

const ARROWS_SLIDE_MS = 500;  // the tab's slide, as in walk.css
const CARD_MARGIN = 16;       // px a phone card keeps from the screen's bottom edge

const GLIDE_S = 1.1;          // seconds to glide to the next point
const GLIDE_EACH_S = 0.35;    // and this much for every further point passed
const phone = matchMedia('(max-width: 760px)');
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
  const points: Point[] = [{ label: 'Zuhause', y: at(0), inWalk: true }];

  act.querySelectorAll<HTMLElement>('.stop').forEach((stop) => {
    const w = windowOf(stop);
    const hold = ((w[1] ?? 0) + (w[2] ?? 0)) / 2;
    const title = stop.querySelector('h2, h3')?.textContent?.trim() ?? 'Leistung';
    points.push({ label: title, y: at(hold), inWalk: true, isService: true, card: stop });
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
    b.className = pt.isService ? 'dots__dot dots__dot--service' : 'dots__dot';
    b.setAttribute('aria-label', pt.label);
    const label = document.createElement('span');
    label.className = 'dots__label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = pt.label;
    b.append(label);
    b.addEventListener('click', () => go(i));
    nav.append(b);
    return b;
  });
  document.body.append(nav);
  return dots;
}

const ARROW_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V5M6 11l6-6 6 6"/></svg>';
const ARROW_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15M6 13l6 6 6-6"/></svg>';

interface Arrows {
  show: (on: boolean, canUp: boolean, canDown: boolean) => void;
}

// The up/down tab. When the set of arrows changes (one <-> two), the whole tab
// slides out, swaps its buttons out of sight and slides back in.
function buildArrows(): Arrows {
  const group = document.createElement('nav');
  group.className = 'walk-steps';
  group.setAttribute('aria-label', 'Leistungen blättern');
  const button = (label: string, attr: string, icon: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.toggleAttribute(attr, true);
    b.innerHTML = icon;
    group.append(b);
    return b;
  };
  const up = button('Zurück', 'data-walk-prev', ARROW_UP);
  const down = button('Weiter', 'data-walk-next', ARROW_DOWN);
  document.body.append(group);

  let want = { on: false, up: false, down: true };
  let swapping = false;
  const setButtons = (): void => { up.disabled = !want.up; down.disabled = !want.down; };
  const sync = (): void => {
    if (swapping) return;
    const same = up.disabled === !want.up && down.disabled === !want.down;
    if (same || !group.classList.contains('is-on')) {
      setButtons();
      group.classList.toggle('is-on', want.on);
      return;
    }
    swapping = true;
    group.classList.remove('is-on');
    setTimeout(() => { swapping = false; setButtons(); sync(); }, ARROWS_SLIDE_MS);
  };
  setButtons();
  return {
    show: (on, canUp, canDown) => { want = { on, up: canUp, down: canDown }; sync(); },
  };
}

// Phones: each card's brass top edge sits level with its dot, so the card
// hangs from the dot it belongs to. The stage is pinned to the viewport, so
// viewport y is stage y. Cards that would run off the bottom move up.
function alignCards(points: Point[], dots: HTMLButtonElement[]): void {
  points.forEach((pt, i) => {
    const card = pt.card;
    const dot = dots[i];
    if (!card || !dot) return;
    if (!phone.matches) { card.style.removeProperty('--card-top'); return; }
    const d = dot.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(card).borderTopWidth) || 0;
    const top = Math.min(d.top + d.height / 2 - border / 2, innerHeight - card.offsetHeight - CARD_MARGIN);
    card.style.setProperty('--card-top', `${Math.round(top)}px`);
  });
}

// Is a light section behind the dots? They sit in the middle of the right edge.
function lightBehind(nav: Element): boolean {
  const r = nav.getBoundingClientRect();
  const y = r.top + r.height / 2;
  const sheet = Array.from(document.querySelectorAll('.sheet')).find((s) => {
    const b = s.getBoundingClientRect();
    return b.top <= y && b.bottom >= y;
  });
  return Boolean(sheet) && !sheet?.classList.contains('sheet--dark');
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
  // Held only inside the walk. The top of the first section is the last
  // point, but it is not held: the next tick down scrolls on straight away.
  const holdsAt = (y: number): boolean => y < zoneEnd() - 1;

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

  const dots = buildDots(points, (i) => {
    const pt = points[i];
    if (!pt) return;
    if (phone.matches) jumpTo(pt.y());
    else glideTo(pt.y());
  });
  const nav = dots[0]?.parentElement;
  const align = (): void => alignCards(points, dots);
  align();
  addEventListener('resize', align);
  void document.fonts?.ready.then(align);   // card heights settle once the fonts are in
  // Without Lenis nothing is held and the cards simply scroll: no arrows.
  const arrows = lenis ? buildArrows() : null;

  // Where a point can actually be scrolled to: the last sections may sit
  // closer to the page's end than a screen height.
  const reach = (pt: Point): number => Math.min(pt.y(), document.documentElement.scrollHeight - innerHeight);
  const nextPoint = (): Point | undefined => points.find((pt) => reach(pt) > scrollY + 2);
  const prevPoint = (): Point | undefined => [...points].reverse().find((pt) => reach(pt) < scrollY - 2);

  function markActive(): void {
    let best = 0;
    points.forEach((pt, i) => { if (scrollY >= pt.y() - innerHeight * 0.35) best = i; });
    dots.forEach((d, i) => d.toggleAttribute('aria-current', i === best));
    nav?.classList.toggle('is-service', Boolean(points[best]?.isService));
    nav?.classList.toggle('is-light', lightBehind(nav));
    arrows?.show(true, Boolean(prevPoint()), Boolean(nextPoint()));
  }

  // The menu jumps: no glide through the film, straight to the target.
  function jumpTo(y: number): void {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else scrollTo({ top: y, behavior: 'instant' });
    pointBefore = nearestZone();
    hold(holdsAt(y));
    markActive();
  }

  // Longer glides take longer, so the film never races through its frames.
  function glideTo(y: number): void {
    if (!lenis) { scrollTo({ top: y, behavior: 'instant' }); markActive(); return; }
    const stays = holdsAt(y);
    const passed = points.filter((pt) => (pt.y() - scrollY) * (pt.y() - y) <= 0).length - 1;
    gliding = true;
    hold(true);
    lenis.scrollTo(y, {
      duration: GLIDE_S + GLIDE_EACH_S * Math.max(0, passed - 1), easing: ease, force: true,
      onComplete: () => { gliding = false; pointBefore = nearestZone(); hold(stays); markActive(); },
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

  // Keys. The arrow keys go one point up or down anywhere on the page, like the
  // up/down tab. Page keys and space step through the walk; in the sections
  // they scroll by the screen as usual, so long text can still be read.
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (gliding) return;
      const to = e.key === 'ArrowDown' ? nextPoint() : prevPoint();
      if (to) glideTo(reach(to));
      return;
    }
    if (!inZoneNow()) return;
    const down = e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
    const up = e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
    if (!down && !up) return;
    if (down && atZoneEnd()) { hold(false); return; }
    e.preventDefault();
    step(down ? 1 : -1);
  });

  // The arrows: one point on or back, gliding like a gesture, through the walk
  // and on through the sections.
  document.addEventListener('click', (e) => {
    const el = e.target as Element | null;
    const dir = el?.closest?.('[data-walk-next]') ? 1 : el?.closest?.('[data-walk-prev]') ? -1 : 0;
    if (!dir || gliding) return;
    const to = dir > 0 ? nextPoint() : prevPoint();
    if (to) glideTo(reach(to));
  });

  // In-page links (rail, logo, skip link) jump, and work while held.
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
    jumpTo(target);
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

  hold(holdsAt(scrollY));
  markActive();
}
