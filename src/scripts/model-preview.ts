const PRELOAD_MARGIN = '300px 0px';

interface NetworkInformationLike {
  saveData?: boolean;
}

function prefersStillContent(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || connection?.saveData === true;
}

export function initModelPreview(): void {
  const figure = document.querySelector<HTMLElement>('[data-model]');
  const frame = figure?.querySelector<HTMLElement>('[data-model-frame]');
  if (!figure || !frame || prefersStillContent()) return;

  figure.hidden = false;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      import('./garden-scene.ts')
        .then(({ mountGardenScene }) => mountGardenScene(frame))
        .catch((error: unknown) => {
          figure.hidden = true;
          console.warn('3D-Beispielmodell konnte nicht geladen werden.', error);
        });
    },
    { rootMargin: PRELOAD_MARGIN },
  );
  observer.observe(figure);
}
