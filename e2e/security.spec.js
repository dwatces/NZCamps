// P0-3 in a real browser: a camp whose name, place, description and review
// are script-shaped text stays text on the list, on its own page and in both
// map popups. (The HTML-level checks are in test/security.test.js.) A script
// that ran would set window.__x, __y, __z or __w; a broken-out <img src=x>
// would also show up as a failed request, which the fixtures report.
const { test, expect, showListMap } = require("./fixtures");
const { HOSTILE } = require("./constants");

const ran = (page) =>
  page.evaluate(() => ["__x", "__y", "__z", "__w"].filter((name) => name in window));

test("P0-3 hostile camp text is inert on the list and in the list map popup", async ({ page }) => {
  await page.goto(`/camps?q=${HOSTILE.search}`);
  await expect(page.locator(".results-count")).toContainText("1 camp matches");
  const card = page.locator(".camp-card");
  await expect(card.locator(".camp-card__title")).toHaveText(HOSTILE.title);
  await expect(card.locator(".camp-meta")).toContainText(HOSTILE.location);

  await showListMap(page);
  await page.locator("#cluster-map .camp-pin").click();
  const popup = page.locator("#cluster-map .leaflet-popup");
  await expect(popup.locator(".map-popup__title a")).toHaveText(HOSTILE.title);
  await expect(popup).toContainText(HOSTILE.location);
  expect(await popup.locator("img, svg, script").count()).toBe(0);
  expect(await ran(page)).toEqual([]);

  // The popup's link opens the camp page.
  await popup.locator(".map-popup__title a").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HOSTILE.title);
});

test("P0-3 hostile camp and review text is inert on the camp page and its map popup", async ({
  page,
}) => {
  await page.goto(`/camps?q=${HOSTILE.search}`);
  await page.locator(".camp-card__title").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HOSTILE.title);
  await expect(page.locator(".camp-description")).toHaveText(HOSTILE.description);
  await expect(page.locator(".review__body")).toHaveText(HOSTILE.review);
  expect(await page.locator('main b, main img[src="x"], main svg script').count()).toBe(0);

  const map = page.locator("#map");
  await map.scrollIntoViewIfNeeded();
  await map.locator(".camp-pin").click();
  const popup = map.locator(".leaflet-popup");
  await expect(popup.locator(".map-popup__title")).toHaveText(HOSTILE.title);
  await expect(popup).toContainText(HOSTILE.location);
  expect(await popup.locator("img, svg, script").count()).toBe(0);
  expect(await ran(page)).toEqual([]);
});
