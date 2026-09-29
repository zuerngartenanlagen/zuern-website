const ACTIVE_CLASS = 'is-active';

function initToggle(toggle: HTMLButtonElement, nav: HTMLElement): void {
  const setOpen = (open: boolean) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}

function initActiveLink(nav: HTMLElement): void {
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[data-nav]')];
  const sections = links
    .map((link) => document.getElementById(link.dataset.nav ?? ''))
    .filter((section): section is HTMLElement => section !== null);
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of links) {
          const isCurrent = link.dataset.nav === entry.target.id;
          link.classList.toggle(ACTIVE_CLASS, isCurrent);
          if (isCurrent) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        }
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  for (const section of sections) observer.observe(section);
}

export function initNav(): void {
  const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  initToggle(toggle, nav);
  initActiveLink(nav);
}
