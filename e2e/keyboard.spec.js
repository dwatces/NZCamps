// Keyboard only, at 390 and 1440 px:
// - the main journey (sign up, find a camp, review it, delete the review,
//   log out) with Tab, arrow keys, typing and Enter: no mouse, no clicks;
// - on each main page, Tab reaches every control in turn, and each one shows
//   the site's focus outline (3 px, #ffd166): checked in its computed style
//   and by comparing a screenshot of it focused and not focused.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect, freshName, isPhone, logIn } = require("./fixtures");
const { MEMBER } = require("./constants");

// What has focus: its tag, its name as a person would read it, and its outline.
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    // A star's radio button is drawn by its label, so the label shows focus.
    const shown = el.matches(".star-input > input") ? el.nextElementSibling : el;
    const cs = getComputedStyle(shown);
    const labelled = el.labels && el.labels.length ? el.labels[0].textContent : "";
    const name = (el.getAttribute("aria-label") || labelled || el.textContent || el.value || "")
      .trim()
      .replace(/\s+/g, " ");
    const r = shown.getBoundingClientRect();
    // Two controls can share a name (two OpenStreetMap links), so each one
    // gets its own number the first time it has focus.
    if (!el.__stop) el.__stop = window.__stops = (window.__stops || 0) + 1;
    return {
      key: el.__stop,
      tag: el.tagName.toLowerCase(),
      name,
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  });

const FOCUS_OUTLINE = /^solid 3px rgb\(255, 209, 102\)$/;

// Presses Tab until the focused control's name matches, and checks that it
// shows the focus outline.
async function tabTo(page, name, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const now = await focused(page);
    if (now && (typeof name === "string" ? now.name === name : name.test(now.name))) {
      expect(now.outline, `focus outline on "${now.name}"`).toMatch(FOCUS_OUTLINE);
      return now;
    }
  }
  throw new Error(`Tab never reached "${name}"`);
}

// Header links on a phone are behind the Menu button. Used straight after a
// page has loaded, so Tab starts from the top.
async function tabToHeader(page, name) {
  if (isPhone(page)) {
    await tabTo(page, "Menu");
    await page.keyboard.press("Enter");
    await expect(page.locator("#site-menu")).toHaveClass(/show/);
  }
  return tabTo(page, name);
}

// Enter, then wait for the page it opens.
async function enterAndLoad(page) {
  await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
}

test("the main journey works with the keyboard alone", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const username = freshName(testInfo, "kb");
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");
  await page.keyboard.press("Tab");
  expect((await focused(page)).name).toBe("Skip to content");
  await tabTo(page, "View Camps");
  await enterAndLoad(page);
  await expect(page).toHaveURL(/\/camps$/);

  await tabToHeader(page, "Sign up");
  await enterAndLoad(page);
  await tabTo(page, "Username");
  await page.keyboard.type(username);
  await page.keyboard.press("Tab");
  await page.keyboard.type(`${username}@example.test`);
  await page.keyboard.press("Tab");
  await page.keyboard.type("keyboard-only-password");
  await enterAndLoad(page);
  await expect(page.locator(".alert-success")).toContainText(`Welcome to NZ Camps, ${username}`);

  await tabTo(page, "Search by name or place");
  await page.keyboard.type("Riverside");
  await enterAndLoad(page);
  await expect(page.locator(".results-count")).toContainText("1 camp matches");
  await tabTo(page, MEMBER.campTitle);
  await enterAndLoad(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(MEMBER.campTitle);

  // Into the star rating: the arrow keys choose a star.
  await tabTo(page, /^1 star/);
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator("#rating-4")).toBeChecked();
  expect((await focused(page)).outline).toMatch(FOCUS_OUTLINE);
  await page.keyboard.press("Tab");
  expect((await focused(page)).name).toBe("Your review");
  await page.keyboard.type("Reviewed with the keyboard only.");
  await tabTo(page, "Post review");
  await enterAndLoad(page);
  await expect(page.locator(".alert-success")).toContainText("Review posted.");
  await expect(page.locator(".review").first()).toContainText("Reviewed with the keyboard only.");

  await tabTo(page, "Delete review");
  await enterAndLoad(page);
  await expect(page.locator(".alert-success")).toContainText("Review deleted.");

  await tabToHeader(page, "Log out");
  await enterAndLoad(page);
  await expect(page.locator(".alert-success")).toContainText("You've logged out.");
});

// Waits until the browser has painted twice, so a screenshot shows the
// current focus state.
const painted = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

// Screenshots of one area with the current control focused and blurred.
async function focusedAndBlurred(page, clip, wait = 0) {
  if (wait) await page.waitForTimeout(wait);
  await painted(page);
  const focusedShot = await page.screenshot({ clip, animations: "disabled" });
  await page.evaluate(() => {
    window.__lastFocus = document.activeElement;
    document.activeElement.blur();
  });
  await painted(page);
  const blurred = await page.screenshot({ clip, animations: "disabled" });
  await page.evaluate(() => window.__lastFocus.focus({ preventScroll: true }));
  return { focused: focusedShot, blurred, same: focusedShot.equals(blurred) };
}

const PAGES = [
  { name: "home", path: () => "/" },
  { name: "camps", path: () => "/camps" },
  { name: "camp", path: (ids) => ids.member },
  { name: "login", path: () => "/login" },
  { name: "register", path: () => "/register" },
  { name: "camp-signed-in", path: (ids) => ids.member, user: true },
  { name: "new", path: () => "/camps/new", user: true },
  { name: "edit", path: (ids) => `${ids.member}/edit`, user: true },
];

for (const target of PAGES) {
  test(`focus is visible on every control: ${target.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const list = await page.request.get(`/camps?q=${encodeURIComponent(MEMBER.campTitle)}`);
    const member = /class="camp-card__title" href="(\/camps\/[^"]+)"/.exec(await list.text())[1];
    if (target.user) await logIn(page);
    await page.goto(target.path({ member }), { waitUntil: "networkidle" });
    await page.evaluate(() => {
      document.activeElement && document.activeElement.blur();
      window.scrollTo(0, 0);
    });

    const seen = new Set();
    const stops = [];
    const secondLook = [];
    const problems = [];
    const viewport = page.viewportSize();
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press("Tab");
      const now = await focused(page);
      if (!now || seen.has(now.key)) break;
      seen.add(now.key);
      stops.push(`${now.tag} "${now.name.slice(0, 40)}"`);
      if (!FOCUS_OUTLINE.test(now.outline)) problems.push(`no outline: ${now.tag} "${now.name}"`);
      // The same area, focused and not focused, must look different.
      const clip = {
        x: Math.max(0, now.rect.x - 8),
        y: Math.max(0, now.rect.y - 8),
        width: Math.min(now.rect.width + 16, viewport.width),
        height: Math.min(now.rect.height + 16, viewport.height),
      };
      if (clip.width > 2 && clip.height > 2 && clip.y + clip.height <= viewport.height) {
        // Map controls sit on composited layers that can take a frame longer
        // to repaint, so a second look is allowed before calling it unseen.
        let shots = await focusedAndBlurred(page, clip);
        if (shots.same) {
          secondLook.push(`${now.tag} "${now.name.slice(0, 40)}"`);
          shots = await focusedAndBlurred(page, clip, 300);
        }
        if (shots.same) {
          problems.push(`no visible change: ${now.tag} "${now.name}"`);
          fs.writeFileSync(testInfo.outputPath(`focused-${stops.length}.png`), shots.focused);
          fs.writeFileSync(testInfo.outputPath(`blurred-${stops.length}.png`), shots.blurred);
        }
      }
    }
    const dir = path.join(__dirname, "..", "test-results", "a11y", testInfo.project.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `focus-${target.name}.json`),
      JSON.stringify({ page: target.name, url: page.url(), stops, secondLook, problems }, null, 2) +
        "\n",
    );
    expect(seen.size, "controls reached with Tab").toBeGreaterThan(3);
    expect(problems).toEqual([]);
  });
}
