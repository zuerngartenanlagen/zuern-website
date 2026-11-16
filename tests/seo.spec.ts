import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const robots = readFileSync('public/robots.txt', 'utf8');
const sitemap = readFileSync('public/sitemap.xml', 'utf8');

test('robots.txt and sitemap.xml are copied and served unchanged', async ({ request }) => {
  expect(readFileSync('dist/robots.txt', 'utf8')).toBe(robots);
  expect(readFileSync('dist/sitemap.xml', 'utf8')).toBe(sitemap);

  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.ok()).toBeTruthy();
  expect(await robotsResponse.text()).toBe(robots);

  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBeTruthy();
  expect(await sitemapResponse.text()).toBe(sitemap);
  expect(sitemap).toContain('<loc>https://zuern-gartenanlagen.de/</loc>');
  expect(sitemap).toContain('<loc>https://zuern-gartenanlagen.de/impressum.html</loc>');
  expect(sitemap).toContain('<loc>https://zuern-gartenanlagen.de/datenschutz.html</loc>');
});

test('the homepage JSON-LD is a landscaping business with the business phone', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const raw = await page.locator('script[type="application/ld+json"]').textContent();
  expect(raw).toBeTruthy();
  const data = JSON.parse(raw ?? '');
  expect(data['@type']).toBe('LandscapingBusiness');
  expect(data.telephone).toBe('+49 175 1193001');
  expect(data.email).toBe('info@zuern-gartenanlagen.de');
  expect(data.address.streetAddress).toBe('Entengasse 13');
  expect(data.address.postalCode).toBe('71717');
  expect(data.address.addressLocality).toBe('Beilstein');
  expect(data.areaServed).toEqual(['Bottwartal', 'Heilbronn', 'Ludwigsburg']);
  expect(JSON.stringify(data)).not.toMatch(/Stuttgart|Bewässerung|Wasserfläche|Objektpflege|\bWEG\b/);
});
