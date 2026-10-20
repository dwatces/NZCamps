// Demo mode (no database): the sample camps can be browsed, every page says
// why, and a change is refused with a plain page instead of an error.
const { test, expect, DEMO_URL, showListMap, markerTotals } = require("./fixtures");

test.use({ baseURL: DEMO_URL });

const BANNER = "Showing sample camps. This copy of NZ Camps has no database connected";

test("demo mode: the sample camps on the list, the map and a camp page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".demo-banner")).toContainText(BANNER);
  await page.getByRole("link", { name: "View Camps" }).click();
  await expect(page.locator(".demo-banner")).toContainText(BANNER);
  await expect(page.locator(".results-count")).toContainText("8 camps");
  const cards = page.locator(".camp-card");
  await expect(cards).toHaveCount(8);
  await expect(cards.getByText("Sample listing")).toHaveCount(8);

  await showListMap(page);
  expect(await markerTotals(page)).toEqual({ data: 8, shown: 8 });

  await page.goto("/camps/demo1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Milford Sound Basecamp");
  await expect(page.locator(".camp-added")).toContainText("Sample listing, not a real campground");
  await expect(page.locator(".demo-banner")).toBeVisible();
});

test("demo mode: logging in is refused with a plain message", async ({ page, guard }) => {
  guard.allow(/\/login$/, 503);
  await page.goto("/login");
  await page.getByLabel("Username").fill("kea_fan");
  await page.getByLabel("Password").fill("any-password-here");
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    page.locator("main").getByRole("button", { name: "Log in" }).click(),
  ]);
  expect(response.status()).toBe(503);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Changes can't be saved right now",
  );
  await expect(page.locator("main")).toContainText("you can browse sample camps");
});
