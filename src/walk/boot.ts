// Runs between the engine and the page scripts (see main.ts): smooth wheel
// scrolling, then the engine mount, which sizes the pinned walk before
// garden.js and walk.js start reading its progress.
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

interface ScrollCraftApi { mount(root: Element): unknown }

declare global {
  // Set by the vendored engine (scrollcraft.js) as a global.
  var ScrollCraft: ScrollCraftApi;
}

// Smooth wheel scrolling (touch stays native). Off under reduced motion.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  new Lenis({ autoRaf: true, lerp: 0.09, anchors: true });
}
globalThis.ScrollCraft.mount(document.body);
