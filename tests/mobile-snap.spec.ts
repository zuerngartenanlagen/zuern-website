// One finger swipe, one topic. WebKit's touch events do not scroll by themselves;
// the page has to move them. These tests only dispatch touches and read where
// the page says it is.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect, test, webkit, type BrowserType, type Page } from '@playwright/test';

const OUT = '/opt/cursor/artifacts';
const IPHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

interface StepLog {
  engine: string;
  kind: string;
  dir: 1 | -1;
  before: number;
  after: number;
  label: string;
  y: number;
}

const logs: StepLog[] = [];

async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

async function snapOf(page: Page): Promise<{ index: number; count: number; label: string; y: number }> {
  return page.evaluate(() => ({
    index: Number(document.documentElement.dataset.snapIndex ?? '-1'),
    count: Number(document.documentElement.dataset.snapCount ?? '0'),
    label: document.documentElement.dataset.snapLabel ?? '',
    y: Number(document.documentElement.dataset.snapY ?? '0'),
  }));
}

async function swipe(page: Page, browserName: string, dir: 1 | -1, kind: 'slow' | 'fast' | 'rapid'): Promise<void> {
  const view = page.viewportSize() ?? { width: 390, height: 844 };
  const x = 110;
  const travel = Math.round(view.height * 0.42);
  const y1 = dir > 0 ? Math.round(view.height * 0.78) : Math.round(view.height * 0.36);
  const y2 = y1 - dir * travel;
  const steps = kind === 'fast' || kind === 'rapid' ? 4 : 14;
  const pause = kind === 'slow' ? 28 : 0;
  const before = await snapOf(page);
  const client = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  const wk = browserName === 'chromium' ? null : (page as unknown as {
    _connection: { toImpl: (p: Page) => { delegate: { _pageProxySession: { send: (m: string, p: object) => Promise<void> } } } };
  })._connection.toImpl(page).delegate._pageProxySession;
  const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) => {
    const point = { x, y, id: 0 };
    if (client) await client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [point] });
    else await wk?.send('Input.dispatchTouchEvent', { type, touchPoints: [point] });
  };
  try {
    await send('touchStart', y1);
    for (let i = 1; i <= steps; i++) {
      await send('touchMove', Math.round(y1 + (y2 - y1) * (i / steps)));
      if (pause) await page.waitForTimeout(pause);
    }
    await send('touchEnd', y2);
  } finally {
    await client?.detach();
  }
  if (kind !== 'rapid') await page.waitForTimeout(560);
  const after = await snapOf(page);
  logs.push({ engine: browserName, kind, dir, before: before.index, after: after.index, label: after.label, y: await scrollY(page) });
  expect(after.index, `${browserName} ${kind} ${after.label}`).toBe(before.index + dir);
}

async function open(browserType: BrowserType, reduced = false): Promise<Page> {
  const browser = await browserType.launch();
  const page = await (await browser.newContext({
    ...IPHONE,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })).newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dots', { state: 'attached' });
  await page.waitForTimeout(reduced ? 50 : 200);
  return page;
}

async function traverse(page: Page, browserName: string, kind: 'slow' | 'fast'): Promise<void> {
  const count = (await snapOf(page)).count;
  expect(count).toBeGreaterThan(6);
  for (let i = 0; i < count - 1; i++) await swipe(page, browserName, 1, kind);
  const foot = await page.evaluate(() => {
    const r = document.querySelector('footer')?.getBoundingClientRect();
    return !!r && r.top < innerHeight && r.bottom > 0;
  });
  expect(foot, `${browserName} ${kind} footer`).toBe(true);
  for (let i = 0; i < count - 1; i++) await swipe(page, browserName, -1, kind);
  expect((await snapOf(page)).index).toBe(0);
}

test.describe.configure({ mode: 'serial' });

for (const browserType of [webkit, chromium]) {
  test(`slow and fast snaps stay on one step (${browserType.name()})`, async () => {
    const page = await open(browserType);
    if (browserType.name() === 'webkit') {
      const count = (await snapOf(page)).count;
      for (let i = 0; i < count; i++) {
        await page.screenshot({ path: `${OUT}/snap_webkit_section_${i}.png` });
        if (i < count - 1) await swipe(page, 'webkit', 1, 'slow');
      }
      // Back to the top with fast flicks, one topic each.
      while ((await snapOf(page)).index > 0) await swipe(page, 'webkit', -1, 'fast');
    } else {
      await traverse(page, browserType.name(), 'slow');
      await traverse(page, browserType.name(), 'fast');
    }
    await page.context().browser()?.close();
  });

  test(`rapid flicks each move one step (${browserType.name()})`, async () => {
    const page = await open(browserType);
    const name = browserType.name();
    for (let i = 0; i < 5; i++) await swipe(page, name, 1, 'rapid');
    await page.waitForTimeout(700);
    const mid = await snapOf(page);
    expect(mid.index).toBe(5);
    expect(Math.abs((await scrollY(page)) - mid.y)).toBeLessThan(40);
    for (let i = 0; i < 5; i++) await swipe(page, name, -1, 'rapid');
    await page.waitForTimeout(700);
    const back = await snapOf(page);
    expect(back.index).toBe(0);
    await page.context().browser()?.close();
  });

  test(`reduced motion still reaches the footer (${browserType.name()})`, async () => {
    const page = await open(browserType, true);
    const name = browserType.name();
    // No snap lock: a touch that the page does not cancel scrolls natively.
    // WebKit's dispatched touches do not scroll on their own, so the test
    // applies the scroll only when the page left the gesture alone.
    for (let n = 0; n < 12; n++) {
      const blocked = await page.evaluate(() => {
        window.__blocked = false;
        return true;
      });
      void blocked;
      await page.evaluate(() => {
        window.__blocked = false;
        if (!window.__arm) {
          window.__arm = true;
          addEventListener('touchmove', (e) => { if (e.defaultPrevented) window.__blocked = true; }, { passive: false });
        }
      });
      const view = page.viewportSize() ?? { width: 390, height: 844 };
      const y1 = Math.round(view.height * 0.8);
      const y2 = Math.round(view.height * 0.25);
      const client = name === 'chromium' ? await page.context().newCDPSession(page) : null;
      const wk = name === 'chromium' ? null : (page as unknown as {
        _connection: { toImpl: (p: Page) => { delegate: { _pageProxySession: { send: (m: string, p: object) => Promise<void> } } } };
      })._connection.toImpl(page).delegate._pageProxySession;
      const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) => {
        const point = { x: 120, y, id: 0 };
        if (client) await client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [point] });
        else await wk?.send('Input.dispatchTouchEvent', { type, touchPoints: [point] });
      };
      const start = await scrollY(page);
      await send('touchStart', y1);
      for (let i = 1; i <= 8; i++) await send('touchMove', Math.round(y1 + (y2 - y1) * (i / 8)));
      const prevented = await page.evaluate(() => window.__blocked === true);
      if (!prevented) await page.evaluate((d) => window.scrollBy({ top: d, left: 0, behavior: 'instant' }), y1 - y2);
      await send('touchEnd', y2);
      await client?.detach();
      expect(await scrollY(page), `${name} reduced swipe ${n}`).toBeGreaterThan(start + 40);
      const foot = await page.evaluate(() => {
        const r = document.querySelector('footer')?.getBoundingClientRect();
        return !!r && r.top < innerHeight;
      });
      if (foot) break;
    }
    const foot = await page.evaluate(() => {
      const r = document.querySelector('footer')?.getBoundingClientRect();
      return !!r && r.top < innerHeight && r.bottom > 0;
    });
    expect(foot).toBe(true);
    await page.context().browser()?.close();
  });
}

test('desktop wheel still steps one point and reaches the footer', async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dots', { state: 'attached' });
  const client = await page.context().newCDPSession(page);
  const wheel = (deltaY: number) => client.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 520, y: 420, deltaX: 0, deltaY,
  });
  await wheel(140);
  await page.waitForTimeout(1400);
  const afterOne = await scrollY(page);
  expect(afterOne).toBeGreaterThan(80);
  expect(afterOne).toBeLessThan(1800);
  for (let i = 0; i < 18; i++) {
    await wheel(220);
    await page.waitForTimeout(900);
    const foot = await page.evaluate(() => {
      const r = document.querySelector('footer')?.getBoundingClientRect();
      return !!r && r.top < innerHeight;
    });
    if (foot) break;
  }
  await page.waitForTimeout(800);
  const foot = await page.evaluate(() => {
    const r = document.querySelector('footer')?.getBoundingClientRect();
    return !!r && r.top < innerHeight && r.bottom > 0;
  });
  expect(foot).toBe(true);
  await browser.close();
});

test('record webkit fast flicks', async () => {
  mkdirSync('/tmp/snap-video', { recursive: true });
  const browser = await webkit.launch();
  const context = await browser.newContext({
    ...IPHONE,
    recordVideo: { dir: '/tmp/snap-video', size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dots', { state: 'attached' });
  await page.waitForTimeout(250);
  const count = (await snapOf(page)).count;
  for (let i = 0; i < count - 1; i++) await swipe(page, 'webkit', 1, 'fast');
  const foot = await page.evaluate(() => {
    const r = document.querySelector('footer')?.getBoundingClientRect();
    return !!r && r.top < innerHeight;
  });
  expect(foot).toBe(true);
  const video = page.video();
  await context.close();
  const src = await video?.path();
  if (!src) throw new Error('no video');
  const { spawnSync } = await import('node:child_process');
  const mp4 = `${OUT}/snap_webkit_fast_flicks.mp4`;
  const ff = spawnSync('ffmpeg', ['-y', '-i', src, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4], { encoding: 'utf8' });
  if (ff.status !== 0) {
    const { copyFileSync } = await import('node:fs');
    copyFileSync(src, `${OUT}/snap_webkit_fast_flicks.webm`);
    throw new Error(ff.stderr?.slice(-500) || 'ffmpeg failed');
  }
});

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  const lines = ['# Snap index log', '', 'One row per swipe. `after` must be `before + dir`.', ''];
  for (const engine of ['webkit', 'chromium']) {
    lines.push(`## ${engine}`, '', '| kind | dir | before | after | label | scrollY |', '|---|---:|---:|---:|---|---:|');
    for (const row of logs.filter((r) => r.engine === engine)) {
      lines.push(`| ${row.kind} | ${row.dir} | ${row.before} | ${row.after} | ${row.label} | ${row.y} |`);
    }
    lines.push('');
  }
  writeFileSync(`${OUT}/snap_index_log.md`, lines.join('\n'));
  appendFileSync(`${OUT}/snap_index_log.md`, '\n');
});

declare global {
  interface Window {
    __blocked?: boolean;
    __arm?: boolean;
  }
}
