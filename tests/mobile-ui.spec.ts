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

async function stepDown(page: Page, browserName: string): Promise<void> {
  const view = page.viewportSize() ?? { width: 390, height: 844 };
  const x = 110;
  const travel = Math.round(view.height * 0.42);
  const y1 = Math.round(view.height * 0.78);
  const y2 = y1 - travel;
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
    for (let i = 1; i <= 14; i++) {
      await send('touchMove', Math.round(y1 + (y2 - y1) * (i / 14)));
      if (i % 2 === 0) await page.waitForTimeout(16);
    }
    await send('touchEnd', y2);
  } finally {
    await client?.detach();
  }
  await page.waitForTimeout(700);
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

  test(`the welcome box sits in the opening picture (${browserType.name()})`, async () => {
    const page = await open(browserType, '/');
    await page.waitForTimeout(400);
    const box = page.locator('.hello');
    await expect(box).toBeVisible();
    await expect(box.locator('a[href="tel:+491751193001"]')).toHaveCount(1);
    await expect(page.locator('.card-icon, .step-icon')).toHaveCount(0);
    await expect(page.locator('#kontakt .kontakt-icon')).toHaveCount(3);
    const metrics = await page.evaluate(() => {
      const card = document.querySelector('.hello');
      const img = document.querySelector('.walk__poster');
      const bubble = document.querySelector('.hello__bubble');
      if (!card || !img || !bubble) return null;
      const c = card.getBoundingClientRect();
      const p = img.getBoundingClientRect();
      return {
        pos: getComputedStyle(card).position,
        h: c.height,
        top: c.top,
        bottom: c.bottom,
        imgTop: p.top,
        imgBottom: p.bottom,
        vh: innerHeight,
        text: bubble.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      };
    });
    expect(metrics).not.toBeNull();
    expect(metrics!.pos).not.toBe('fixed');
    expect(metrics!.h).toBeLessThan(193);
    expect(metrics!.h).toBeLessThanOrEqual(metrics!.vh / 3 + 1);
    expect(metrics!.h).toBeGreaterThan(48);
    const places = await page.evaluate(() => {
      const face = document.querySelector('.hello__face')?.getBoundingClientRect();
      const bubble = document.querySelector('.hello__bubble')?.getBoundingClientRect();
      const call = document.querySelector('.hello__call')?.getBoundingClientRect();
      if (!face || !bubble || !call) return null;
      return {
        faceLeft: face.left, bubbleRight: bubble.right,
        callTop: call.top, faceBottom: face.bottom,
        callCenter: call.left + call.width / 2,
        faceCenter: face.left + face.width / 2,
      };
    });
    expect(places).not.toBeNull();
    expect(places!.faceLeft).toBeGreaterThan(places!.bubbleRight - 4);
    expect(places!.callTop).toBeGreaterThanOrEqual(places!.faceBottom - 2);
    expect(Math.abs(places!.callCenter - places!.faceCenter)).toBeLessThan(8);
    expect(metrics!.top).toBeGreaterThan(metrics!.imgTop);
    expect(metrics!.bottom).toBeLessThanOrEqual(metrics!.imgBottom + 1);
    expect(metrics!.bottom).toBeLessThanOrEqual(metrics!.vh + 1);
    expect(metrics!.text).toBe('Schön, dass Sie da sind! Ich bin Marcel Zürn. Ich plane und baue Gärten rund um Beilstein, von der ersten Skizze bis zur letzten Pflanze. Gehen Sie ruhig ein Stück mit durch den Garten.');
    await expect(page.locator('.walk-steps')).toBeHidden();
    const title = page.locator('.stop h3', { hasText: 'CAD- und' });
    await expect(title.locator('.nowrap')).toHaveText('3D\u2011Planung');
    await stepDown(page, browserType.name());
    await expect(page.locator('.walk-steps')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.snapIndex)).toBe('1');
    await page.context().browser()?.close();
  });

  test(`service topics open in place and a tap lands on that station (${browserType.name()})`, async () => {
    const page = await open(browserType, '/');
    await page.waitForTimeout(300);
    for (let n = 0; n < 6; n++) {
      const label = await page.evaluate(() => document.documentElement.dataset.snapLabel ?? '');
      if (label.startsWith('Planung, Bau und Pflege')) break;
      await stepDown(page, browserType.name());
    }
    await expect(page.locator('.stops .stop')).toHaveCount(5);
    await expect(page.locator('.stop__toggle[aria-expanded="true"]')).toContainText('Planung, Bau und Pflege aus einer Hand');
    const before = await page.evaluate(() => ({
      y: Math.round(window.scrollY),
      top: Math.round(document.querySelector('.stops')?.getBoundingClientRect().top ?? 0),
      open: Math.round(document.querySelector('.stop.is-current p')?.getBoundingClientRect().height ?? 0),
    }));
    await page.locator('.stop__toggle', { hasText: 'Neuanlage und Umgestaltung' }).click();
    await page.waitForTimeout(400);
    const landed = await page.evaluate(() => ({
      y: Math.round(window.scrollY),
      snap: Number(document.documentElement.dataset.snapY ?? '0'),
      label: document.documentElement.dataset.snapLabel ?? '',
      top: Math.round(document.querySelector('.stops')?.getBoundingClientRect().top ?? 0),
      open: Math.round(document.querySelector('.stop.is-current p')?.getBoundingClientRect().height ?? 0),
    }));
    expect(Math.abs(landed.y - landed.snap)).toBeLessThanOrEqual(2);
    expect(Math.abs(landed.top - before.top)).toBeLessThanOrEqual(2);
    expect(landed.label).toBe('Neuanlage und Umgestaltung');
    expect(landed.open).toBeLessThan(before.open - 20);
    await page.waitForTimeout(300);
    const held = await page.evaluate(() => Math.round(window.scrollY));
    expect(Math.abs(held - landed.y)).toBeLessThanOrEqual(2);
    await expect(page.locator('.stop__toggle[aria-expanded="true"]')).toHaveText('Neuanlage und Umgestaltung');
    await stepDown(page, browserType.name());
    await expect(page.locator('.stop__toggle[aria-expanded="true"]')).toHaveText('Pflanzung');
    await page.context().browser()?.close();
  });
}
