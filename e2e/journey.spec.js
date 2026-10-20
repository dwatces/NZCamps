// The main user journeys in a real browser, at 390 px (a phone) and 1440 px:
// browse and search, then sign up, add a camp with a photo, review it, move
// it, change its photos, and remove everything again. The fixtures fail any
// step that logs a console error, breaks the CSP, has a failed request or
// scrolls sideways.
const path = require("node:path");
const {
  test,
  expect,
  isPhone,
  headerLink,
  logOut,
  signUp,
  freshName,
  showListMap,
  markerTotals,
  campData,
} = require("./fixtures");

const BIG_PHOTO = path.join(__dirname, "fixtures", "big-photo.jpg"); // 2400 x 1600
const SMALL_PHOTO = path.join(__dirname, "..", "public", "images", "hahei-kura-tregenza-800.jpg");

// Waits for a photo on the page to load and returns its pixel width.
async function loadedWidth(img) {
  await expect
    .poll(() => img.evaluate((el) => el.complete && el.naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
  return img.evaluate((el) => el.naturalWidth);
}

test.describe("browsing", () => {
  test("home page to the camps list, with every camp on the map", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New Zealand Camps");
    await page.getByRole("link", { name: "View Camps" }).click();
    await expect(page).toHaveURL(/\/camps$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explore camps");
    await expect(page.locator(".camp-card").first()).toBeVisible();

    await showListMap(page);
    const totals = await markerTotals(page);
    expect(totals.data).toBeGreaterThanOrEqual(13);
    expect(totals.shown).toBe(totals.data);
  });

  test("searching for Tekapo finds the two Tekapo camps", async ({ page }) => {
    await page.goto("/camps");
    await page.getByLabel("Search by name or place").fill("Tekapo");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/camps\?q=Tekapo/);
    await expect(page.locator(".results-count")).toContainText("2 camps match “Tekapo”");
    const titles = await page.locator(".camp-card__title").allTextContents();
    expect(titles.sort()).toEqual(["Riverside Flat", "Tekapo Lakeside Pitch"]);
    // The sample listing says so on its card.
    const sample = page.locator(".camp-card", { hasText: "Tekapo Lakeside Pitch" });
    await expect(sample.getByText("Sample listing")).toBeVisible();

    await showListMap(page);
    expect(await markerTotals(page)).toEqual({ data: 2, shown: 2 });

    await page.getByRole("link", { name: "Clear search" }).click();
    await expect(page).toHaveURL(/\/camps$/);
  });

  test("the list has a second page", async ({ page }) => {
    await page.goto("/camps");
    const pager = page.getByRole("navigation", { name: "Pagination" });
    await pager.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explore camps");
    await expect(pager.locator('[aria-current="page"]')).toHaveText("Page 2");
    await expect(page.locator(".camp-card").first()).toBeVisible();
  });
});

test("a member adds, reviews, edits and deletes a camp", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const username = freshName(testInfo);
  const title = `Test camp ${testInfo.project.name}`;
  page.on("dialog", (dialog) => dialog.accept());

  await test.step("sign up from the header", async () => {
    await page.goto("/camps");
    await (await headerLink(page, "Sign up")).click();
    await expect(page).toHaveURL(/\/register$/);
    await signUp(page, username);
    await expect(page).toHaveURL(/\/camps$/);
  });

  let campUrl;
  await test.step("add a camp with a photo, shrunk in the browser", async () => {
    await (await headerLink(page, "Add a camp")).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a camp");
    await page.getByLabel("Camp name").fill(title);
    await page.getByLabel("Location").fill("Lake Tekapo");
    await page.getByLabel("Price per night").fill("22.50");
    await page
      .getByLabel("Description")
      .fill("Made by the end-to-end test. Sheltered sites under the pines.");
    await page.setInputFiles("#image", BIG_PHOTO);
    await expect(page.locator("#image-status")).toHaveText(/^1 photo ready to upload/);
    const chosen = await page.evaluate(async () => {
      const f = document.getElementById("image").files[0];
      const bitmap = await createImageBitmap(f);
      return { type: f.type, width: bitmap.width, height: bitmap.height };
    });
    expect(chosen).toEqual({ type: "image/jpeg", width: 1600, height: 1067 });
    await expect(page.locator("#image-previews li")).toHaveCount(1);

    await page.getByRole("button", { name: "Add camp" }).click();
    await expect(page.locator(".alert-success")).toContainText(
      "Camp added. We placed it at Lake Tekapo, Canterbury, New Zealand.",
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    campUrl = page.url();
    expect(await loadedWidth(page.locator(".gallery__img").first())).toBe(1600);
    await expect(page.locator(".camp-head .rating-summary")).toHaveText("No reviews yet");
    await expect(page.locator(".camp-added")).toContainText(`Added by ${username} on`);
    await expect(page.locator("#map .camp-pin")).toHaveCount(1);
  });

  await test.step("leave a review and see the rating summary change", async () => {
    await page.locator('label[for="rating-4"]').click();
    await page.getByLabel("Your review").fill("Good shelter from the wind.");
    await page.getByRole("button", { name: "Post review" }).click();
    await expect(page.locator(".alert-success")).toContainText("Review posted.");
    await expect(page.locator(".camp-head .rating-summary")).toContainText("4.0 (1 review)");
    const review = page.locator(".review").first();
    await expect(review.locator(".review__author")).toHaveText(username);
    await expect(review).toContainText("Rated 4 out of 5");
  });

  await test.step("move the camp and see the pin move", async () => {
    const before = await campData(page);
    await page.getByRole("link", { name: "Edit camp" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit camp");
    await page.getByLabel("Location").fill("Invercargill");
    await page.setInputFiles("#image", SMALL_PHOTO);
    await expect(page.locator("#image-status")).toHaveText(/^1 photo ready to upload/);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".alert-success")).toContainText(
      "Camp updated. We placed it at Invercargill, Southland, New Zealand.",
    );
    const after = await campData(page);
    expect(before.lat).toBeCloseTo(-44.0045, 3);
    expect(after.lat).toBeCloseTo(-46.4132, 3);
    expect(after.lng).toBeCloseTo(168.3538, 3);
    // The map is centred on the new place, so the pin sits in its middle.
    const map = await page.locator("#map").boundingBox();
    const pin = await page.locator("#map .camp-pin").boundingBox();
    expect(Math.abs(pin.x + pin.width / 2 - (map.x + map.width / 2))).toBeLessThan(30);
    await expect(page.locator(".camp-summary")).toContainText("Invercargill");
    await expect(page.locator("#gallery-count")).toHaveText("Photo 1 of 2");
  });

  await test.step("remove a photo", async () => {
    await page.getByRole("link", { name: "Edit camp" }).click();
    await page.getByLabel("Remove photo 1 of 2").check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".alert-success")).toContainText("Camp updated.");
    await expect(page.locator(".gallery .carousel-item")).toHaveCount(1);
    await expect(page.locator("#gallery-count")).toHaveCount(0);
    expect(await loadedWidth(page.locator(".gallery__img").first())).toBe(800);
  });

  await test.step("delete the review", async () => {
    await page.getByRole("button", { name: "Delete review" }).click();
    await expect(page.locator(".alert-success")).toContainText("Review deleted.");
    await expect(page.locator(".reviews-empty")).toHaveText(
      "No reviews yet. Be the first to leave one.",
    );
    await expect(page.locator(".camp-head .rating-summary")).toHaveText("No reviews yet");
  });

  await test.step("delete the camp", async () => {
    await page.locator(".camp-owner").getByRole("button", { name: "Delete camp" }).click();
    await expect(page).toHaveURL(/\/camps$/);
    await expect(page.locator(".alert-success")).toContainText("Camp deleted.");
    await page.goto(`/camps?q=${encodeURIComponent(title)}`);
    await expect(page.locator(".results-count")).toContainText("No camps match");
    const gone = await page.request.get(campUrl);
    expect(gone.status()).toBe(404);
  });

  await test.step("log out", async () => {
    await logOut(page);
    await expect(page).toHaveURL(/\/camps$/);
    if (isPhone(page)) await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator(".site-header").getByRole("link", { name: "Log in" })).toBeVisible();
  });
});
