import { expect, test, webkit, chromium, type BrowserType, type Page } from '@playwright/test';

const PHONE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  reducedMotion: 'no-preference' as const,
};

async function open(browserType: BrowserType, path: string, viewport = PHONE.viewport): Promise<Page> {
  const browser = await browserType.launch();
  const page = await (await browser.newContext({ ...PHONE, viewport })).newPage();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.nav-toggle', { state: 'attached' });
  return page;
}

async function flickCarousel(page: Page, browserName: string): Promise<void> {
  const box = await page.locator('#planung .steps').boundingBox();
  if (!box) throw new Error('no carousel');
  const y = Math.round(box.y + box.height / 2);
  const x1 = Math.round(box.x + box.width * 0.82);
  const x2 = Math.round(box.x + box.width * 0.18);
  const client = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  const wk = browserName === 'chromium' ? null : (page as unknown as {
    _connection: { toImpl: (p: Page) => { delegate: { _pageProxySession: { send: (m: string, p: object) => Promise<void> } } } };
  })._connection.toImpl(page).delegate._pageProxySession;
  const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) => {
    const point = { x, y, id: 0 };
    if (client) await client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [point] });
    else await wk?.send('Input.dispatchTouchEvent', { type, touchPoints: [point] });
  };
  try {
    await send('touchStart', x1);
    for (let i = 1; i <= 6; i++) await send('touchMove', Math.round(x1 + (x2 - x1) * (i / 6)));
    await send('touchEnd', x2);
  } finally {
    await client?.detach();
  }
}

for (const browserType of [webkit, chromium]) {
  for (const path of ['/', '/impressum.html', '/datenschutz.html']) {
    test(`the phone menu opens and closes (${browserType.name()} ${path})`, async () => {
      const page = await open(browserType, path);
      const toggle = page.locator('.nav-toggle');
      const nav = page.locator('#site-nav');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveAttribute('aria-controls', 'site-nav');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(nav).toBeVisible();
      for (const label of ['Leistungen', 'Planung', 'Über mich', 'Kontakt']) {
        await expect(nav.getByRole('link', { name: label })).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await page.locator('body').click({ position: { x: 12, y: 500 } });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await nav.getByRole('link', { name: 'Kontakt' }).click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.context().browser()?.close();
    });
  }

  test(`planning cards slide sideways without changing station (${browserType.name()})`, async () => {
    const page = await open(browserType, '/');
    await page.waitForSelector('#planung .steps.is-carousel');
    await page.locator('.nav-toggle').click();
    await page.locator('#site-nav a[href="#planung"]').click();
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => ({
      index: document.documentElement.dataset.snapIndex,
      left: document.querySelector<HTMLElement>('#planung .steps')?.scrollLeft ?? 0,
    }));
    expect(await page.locator('.steps-hint').isVisible()).toBe(true);
    await flickCarousel(page, browserType.name());
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('#planung .steps');
      return {
        index: document.documentElement.dataset.snapIndex,
        left: row?.scrollLeft ?? 0,
        width: row?.clientWidth ?? 1,
        phase: document.querySelector('.phase-show__set.is-active')?.getAttribute('data-phase'),
        hint: document.querySelector('.steps-hint')?.classList.contains('is-gone') === true,
      };
    });
    expect(after.index).toBe(before.index);
    expect(after.left).toBeGreaterThan(after.width * 0.6);
    expect(after.phase).toBe('1');
    expect(after.hint).toBe(true);
    await page.context().browser()?.close();
  });

  for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    test(`about text and portrait do not overlap (${browserType.name()} ${size.width}×${size.height})`, async () => {
      const page = await open(browserType, '/', size);
      await page.locator('.nav-toggle').click();
      await page.locator('#site-nav a[href="#ueber-mich"]').click();
      await page.waitForTimeout(900);
      const gap = await page.evaluate(() => {
        const text = document.querySelector('.about__main')?.getBoundingClientRect();
        const picture = document.querySelector('.portrait')?.getBoundingClientRect();
        if (!text || !picture) return -1;
        return picture.top - text.bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(-1);
      await expect(page.getByText('Ausbilderschein nach AEVO')).toBeVisible();
      await expect(page.getByText('AdA-Schein')).toHaveCount(0);
      await page.context().browser()?.close();
    });
  }

  test(`the welcome box sits under the start image (${browserType.name()})`, async () => {
    const page = await open(browserType, '/');
    await page.waitForTimeout(250);
    const box = page.locator('.start-box');
    await expect(box).toBeVisible();
    await expect(box.locator('a[href="tel:+491751193001"]')).toHaveCount(1);
    await expect(page.locator('#kontakt .start-box, #kontakt .kontakt-karte')).toHaveCount(0);
    const metrics = await page.evaluate(() => {
      const card = document.querySelector('.start-box');
      const img = document.querySelector('.walk__poster');
      if (!card || !img) return null;
      const c = card.getBoundingClientRect();
      const p = img.getBoundingClientRect();
      return {
        pos: getComputedStyle(card).position,
        h: c.height,
        top: c.top,
        bottom: c.bottom,
        imgBottom: p.bottom,
        vh: innerHeight,
      };
    });
    expect(metrics).not.toBeNull();
    expect(metrics!.pos).not.toBe('fixed');
    expect(metrics!.h).toBeLessThanOrEqual(metrics!.vh / 3 + 1);
    expect(metrics!.h).toBeGreaterThan(48);
    expect(metrics!.top).toBeGreaterThanOrEqual(metrics!.imgBottom - 2);
    expect(metrics!.top).toBeGreaterThanOrEqual(0);
    expect(metrics!.bottom).toBeLessThanOrEqual(metrics!.vh + 1);
    await expect(box).toContainText('Schön, dass Sie da sind!');
    await page.context().browser()?.close();
  });
}
