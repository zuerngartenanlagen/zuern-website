// Finger-scroll from the top of the start page, through „Erst sehen, dann bauen“,
// to the footer. WebKit's Input.dispatchTouchEvent delivers a real touch (the
// page's listeners run and preventDefault works) but does not perform the
// browser's scroll default action. When the page does not cancel the move, the
// helper scrolls by the finger delta, which is what iOS Safari does for an
// uncancelled touch. Chromium's CDP touch scrolls natively, so it is left alone.
import { chromium, expect, test, webkit, type BrowserType, type Page } from '@playwright/test';

const IPHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

interface Swipe {
  duringDelta: number;
  end: number;
  prevented: boolean;
}

async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

async function fingerSwipe(page: Page, browserName: string): Promise<Swipe> {
  const view = page.viewportSize() ?? { width: 390, height: 844 };
  const x = 130;
  const y1 = Math.round(view.height * 0.74);
  const y2 = Math.round(view.height * 0.26);
  const steps = 12;
  await page.evaluate(() => { window.__touchPrevented = false; });
  const start = await scrollY(page);
  const client = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  const wk = browserName === 'chromium' ? null : (page as unknown as {
    _connection: { toImpl: (p: Page) => { delegate: { _pageProxySession: { send: (m: string, p: object) => Promise<void> } } } };
  })._connection.toImpl(page).delegate._pageProxySession;

  const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) => {
    const point = { x, y, id: 0 };
    if (client) {
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [point],
      });
    } else {
      // WebKit only emits touchend when the lifted point is still listed.
      await wk?.send('Input.dispatchTouchEvent', { type, touchPoints: [point] });
    }
  };

  try {
    await send('touchStart', y1);
    let prevented = false;
    for (let i = 1; i <= steps; i++) {
      const y = Math.round(y1 + (y2 - y1) * (i / steps));
      await send('touchMove', y);
      const blocked = await page.evaluate(() => window.__touchPrevented === true);
      if (blocked) prevented = true;
      if (browserName !== 'chromium' && !blocked) {
        const delta = Math.round((y1 - y2) / steps);
        await page.evaluate((d) => window.scrollBy({ top: d, left: 0, behavior: 'instant' }), delta);
      }
    }
    const during = await scrollY(page);
    await send('touchEnd', y2);
    await page.waitForTimeout(browserName === 'chromium' ? 280 : 40);
    return { duringDelta: during - start, end: await scrollY(page), prevented };
  } finally {
    await client?.detach();
  }
}

async function footerVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const foot = document.querySelector('footer');
    if (!foot) return false;
    const r = foot.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
}

async function contactOpacity(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('.kontakt');
    return el ? parseFloat(getComputedStyle(el).opacity) : 0;
  });
}

// data-sc-in fades the block in over 620ms once it has entered. The footer
// can already be on screen while that transition is still running.
async function waitForContactReveal(page: Page): Promise<number> {
  let opacity = await contactOpacity(page);
  for (let i = 0; i < 30 && opacity < 0.99; i++) {
    await page.waitForTimeout(50);
    opacity = await contactOpacity(page);
  }
  await page.waitForTimeout(700);
  return contactOpacity(page);
}

async function arm(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dots', { state: 'attached' });
  await page.evaluate(() => {
    window.__touchPrevented = false;
    addEventListener('touchmove', (e) => {
      if (e.defaultPrevented) window.__touchPrevented = true;
    }, { passive: false });
  });
}

function shotDir(): string | null {
  return process.env.SHOT_DIR ?? null;
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = shotDir();
  if (!dir) return;
  const browser = page.context().browser()?.browserType().name() ?? 'browser';
  await page.screenshot({ path: `${dir}/${process.env.SHOT_LABEL ?? 'run'}_${browser}_${name}.png` });
}

async function swipeToFooter(page: Page, browserName: string): Promise<{ samples: Swipe[]; contact: number }> {
  const samples: Swipe[] = [];
  let contact = 1;
  let resized = false;
  let phaseShot = 0;
  let stuckShots = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 42; i++) {
    const view = page.viewportSize() ?? { width: 390, height: 844 };
    const info = await page.evaluate(() => {
      const title = document.getElementById('planung-title')?.getBoundingClientRect();
      const label = document.querySelector('.steps__now')?.textContent?.trim() ?? '';
      return {
        titleTop: title ? Math.round(title.top) : 9999,
        titleBottom: title ? Math.round(title.bottom) : 0,
        label,
      };
    });
    if (info.titleTop > view.height && samples.length === 2) await shot(page, 'before_section');
    if (info.titleTop > 40 && info.titleTop < view.height * 0.45) await shot(page, 'at_section');
    if (info.label && info.titleTop < view.height && info.titleBottom > 0 && !seen.has(info.label)) {
      seen.add(info.label);
      phaseShot += 1;
      await shot(page, `phase_${phaseShot}_${info.label.replace(/\s+/g, '_')}`);
    }
    if (!resized && info.titleTop > 0 && info.titleTop < view.height * 0.5) {
      // Address bar shows, then hides again, while the section is on screen.
      await page.setViewportSize({ width: 390, height: 720 });
      await page.waitForTimeout(280);
      samples.push(await fingerSwipe(page, browserName));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(280);
      resized = true;
    }
    const swipe = await fingerSwipe(page, browserName);
    samples.push(swipe);
    // A cancelled touch does not move while the finger is down. On the old
    // page the release still glides one step; wait that out so a later shot
    // can show the section the finger can no longer leave.
    if (swipe.duringDelta < 40) await page.waitForTimeout(1200);
    if (swipe.duringDelta < 40 && info.titleTop < view.height && info.titleBottom > 0) {
      stuckShots += 1;
      await shot(page, 'stuck_at_section');
      if (stuckShots >= 2) break;
    }
    if (await footerVisible(page)) {
      contact = await waitForContactReveal(page);
      await shot(page, 'after_section');
      const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (!reduced && browserName === 'webkit') await shot(page, 'contact_revealed');
      break;
    }
  }
  return { samples, contact };
}

async function openMobile(browserType: BrowserType, reduced = false): Promise<Page> {
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...IPHONE, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.on('close', () => { void browser.close(); });
  return page;
}

for (const browserType of [webkit, chromium]) {
  test(`finger scroll reaches the footer (${browserType.name()})`, async () => {
    const page = await openMobile(browserType);
    await arm(page);
    const { samples, contact } = await swipeToFooter(page, browserType.name());
    const stuck = samples.filter((s) => s.duringDelta < 40);
    expect(stuck, `scroll did not follow the finger: ${JSON.stringify(samples.map((s) => s.duringDelta))}`).toEqual([]);
    expect(await footerVisible(page)).toBe(true);
    expect(contact).toBeGreaterThan(0.99);
    const pin = await page.locator('#planung').evaluate((el) => el.getBoundingClientRect().height);
    expect(pin).toBeGreaterThan(844 * 2);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(wide).toBe(true);
    await page.context().browser()?.close();
  });

  test(`reduced motion stays static and scrollable (${browserType.name()})`, async () => {
    const page = await openMobile(browserType, true);
    await arm(page);
    const { samples, contact } = await swipeToFooter(page, browserType.name());
    expect(samples.filter((s) => s.duringDelta < 40)).toEqual([]);
    expect(await footerVisible(page)).toBe(true);
    expect(contact).toBeGreaterThan(0.99);
    const pin = await page.locator('#planung').evaluate((el) => el.getBoundingClientRect().height);
    expect(pin).toBeLessThan(844 * 2);
    const font = await page.locator('#planung .steps h3').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(font).toBeGreaterThan(12);
    await shot(page, 'reduced_motion');
    await page.context().browser()?.close();
  });
}

test('desktop wheel still steps and reaches the footer', async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dots', { state: 'attached' });
  const client = await page.context().newCDPSession(page);
  const wheel = (deltaY: number) => client.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 520, y: 420, deltaX: 0, deltaY,
  });
  // One notch glides a single point. It must not fling the whole page.
  await wheel(140);
  await page.waitForTimeout(1400);
  const afterOne = await scrollY(page);
  expect(afterOne).toBeGreaterThan(80);
  expect(afterOne).toBeLessThan(1800);
  for (let i = 0; i < 18; i++) {
    await wheel(220);
    await page.waitForTimeout(900);
    if (await footerVisible(page)) break;
  }
  await page.waitForTimeout(1200);
  expect(await footerVisible(page)).toBe(true);
  await shot(page, 'desktop_footer');
  await browser.close();
});

declare global {
  interface Window {
    __touchPrevented?: boolean;
  }
}
