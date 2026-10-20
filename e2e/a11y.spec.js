// Accessibility checks to WCAG 2.2 AA on every page state, at 390 and
// 1440 px (and reflow at 320 px):
// - axe-core with the wcag2a, wcag2aa, wcag21a, wcag21aa and wcag22aa tags
//   must find nothing; its best-practice rules are run and saved, not failed;
// - every control is a target of at least 44 by 44 px, except links inside a
//   sentence (WCAG 2.5.8's inline exception); the map's credit links count;
// - nothing scrolls sideways at 320 px;
// - with reduced motion, the carousel and both maps do not animate.
// Results are saved as JSON under test-results/a11y/<project>/.
const fs = require("node:fs");
const path = require("node:path");
const AxeBuilder = require("@axe-core/playwright").default;
const { test, expect, DEMO_URL, logIn, showListMap } = require("./fixtures");
const { MEMBER, NO_PHOTO_TITLE } = require("./constants");

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const OUT = path.join(__dirname, "..", "test-results", "a11y");

// The path of a camp's page, found by its title with the search.
async function campPath(page, title, base = "") {
  const res = await page.request.get(`${base}/camps?q=${encodeURIComponent(title)}`);
  const m = /class="camp-card__title" href="(\/camps\/[^"]+)"/.exec(await res.text());
  if (!m) throw new Error(`No camp called ${title}`);
  return m[1];
}

// Controls smaller than 44 x 44 px, with the exemptions above.
const smallTargets = (page) =>
  page.evaluate(() => {
    const small = [];
    const controls = document.querySelectorAll(
      "a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex='-1'])",
    );
    for (const el of controls) {
      // A radio or checkbox is operated through its label.
      const target =
        el.matches("input[type=radio], input[type=checkbox]") && el.labels && el.labels.length
          ? el.labels[0]
          : el;
      const r = target.getBoundingClientRect();
      const cs = getComputedStyle(target);
      if (!r.width || !r.height || cs.visibility === "hidden" || target.closest("[hidden]"))
        continue;
      if (target.closest(".visually-hidden")) continue;
      if (r.right <= 0 || r.bottom <= 0) continue; // the skip link until it has focus
      if (cs.display === "inline" && target.closest("p, li, dd, figcaption, small, td")) continue;
      if (r.width < 43.5 || r.height < 43.5) {
        const name = (target.textContent || el.getAttribute("aria-label") || el.name || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 40);
        small.push(
          `${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
      }
    }
    return small;
  });

const width = (page) =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

function save(testInfo, name, result) {
  const dir = path.join(OUT, testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(result, null, 2) + "\n");
}

const brief = (violations) =>
  violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 10),
  }));

// Each state: where to go, who is logged in, and what to do first.
const STATES = [
  { name: "home", go: () => "/" },
  { name: "camps-signed-out", go: () => "/camps", map: true },
  { name: "camps-signed-in", go: () => "/camps", user: MEMBER.username, map: true },
  { name: "camps-empty-search", go: () => "/camps?q=zzzz", map: "empty" },
  { name: "camps-page-2", go: () => "/camps?page=2" },
  { name: "camp-with-photos", go: (p) => campPath(p, MEMBER.campTitle) },
  { name: "camp-no-photos", go: (p) => campPath(p, NO_PHOTO_TITLE) },
  {
    name: "camp-signed-in-with-review",
    go: (p) => campPath(p, MEMBER.campTitle),
    user: "tui_walker",
  },
  { name: "camp-signed-in-owner", go: (p) => campPath(p, MEMBER.campTitle), user: MEMBER.username },
  { name: "new", go: () => "/camps/new", user: MEMBER.username },
  {
    name: "new-with-errors",
    go: () => "/camps/new",
    user: MEMBER.username,
    act: async (page) => {
      await page.getByRole("button", { name: "Add camp" }).click();
      await expect(page.locator("#form-errors")).toBeFocused();
    },
  },
  {
    // The server's own error page for the form (a place the geocoder cannot
    // find), not the summary the browser script builds.
    name: "new-server-error",
    go: () => "/camps/new",
    user: MEMBER.username,
    allow: [/\/camps$/, 422],
    act: async (page) => {
      await page.getByLabel("Camp name").fill("Somewhere new");
      await page.getByLabel("Location").fill("Nowhere at all");
      await page.getByLabel("Price per night").fill("10");
      await page.getByLabel("Description").fill("A camp at a place that cannot be found.");
      await page.getByRole("button", { name: "Add camp" }).click();
      await expect(page.locator("#form-errors")).toBeFocused();
      await expect(page.locator("#location-error")).toContainText("couldn't find that location");
    },
  },
  {
    name: "edit-with-photos",
    go: async (p) => `${await campPath(p, MEMBER.campTitle)}/edit`,
    user: MEMBER.username,
  },
  {
    name: "login-with-error",
    go: () => "/login",
    act: async (page) => {
      // A reviewer's account, so the slower retries after a wrong password
      // never touch the account other states log in with.
      await page.getByLabel("Username").fill("weka_watch");
      await page.getByLabel("Password").fill("not-the-password");
      await page.locator("main").getByRole("button", { name: "Log in" }).click();
      await expect(page.locator(".alert-danger")).toBeVisible();
    },
  },
  {
    name: "register-duplicate",
    go: () => "/register",
    allow: [/\/register$/, 422],
    act: async (page) => {
      await page.getByLabel("Username").fill(MEMBER.username);
      await page.getByLabel("Email").fill("someone@example.test");
      await page.getByLabel("Password").fill("a-long-enough-password");
      await page.locator("main").getByRole("button", { name: "Sign up" }).click();
      await expect(page.locator("#form-errors")).toBeVisible();
    },
  },
  { name: "logout-page", go: () => "/logout", allow: [/\/logout$/, 405] },
  { name: "credits", go: () => "/credits" },
  { name: "not-found", go: () => "/no-such-page", allow: [/\/no-such-page$/, 404] },
  { name: "demo-camps", go: () => `${DEMO_URL}/camps`, map: true },
  { name: "demo-camp", go: () => `${DEMO_URL}/camps/demo1` },
];

async function open(page, guard, state) {
  if (state.allow) guard.allow(...state.allow);
  if (state.user) await logIn(page, state.user);
  await page.goto(await state.go(page));
  if (state.act) await state.act(page);
  // On a phone the list's map is behind the Map button: check it shown too.
  if (state.map) await showListMap(page, { markers: state.map !== "empty" });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("axe, targets and width", () => {
  for (const state of STATES) {
    test(`a11y: ${state.name}`, async ({ page, guard }, testInfo) => {
      await open(page, guard, state);
      const wcag = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const practice = await new AxeBuilder({ page }).withTags(["best-practice"]).analyze();
      const small = await smallTargets(page);
      const result = {
        state: state.name,
        url: page.url(),
        viewport: page.viewportSize(),
        axeVersion: wcag.testEngine.version,
        wcagViolations: brief(wcag.violations),
        wcagPasses: wcag.passes.length,
        bestPracticeViolations: brief(practice.violations),
        smallTargets: small,
        width: await width(page),
      };
      save(testInfo, state.name, result);
      expect(result.wcagViolations, "axe WCAG 2.2 AA violations").toEqual([]);
      expect(small, "controls under 44 x 44 px").toEqual([]);
    });
  }
});

test("the target scan reports a small control (a check of the check)", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "once is enough");
  await page.goto("/credits");
  await page.evaluate(() => {
    const tiny = document.createElement("button");
    tiny.type = "button";
    tiny.textContent = "x";
    tiny.style.cssText = "width: 20px; height: 20px; padding: 0; min-height: 0";
    document.querySelector("main").append(tiny);
  });
  expect(await smallTargets(page)).toEqual(['button "x" 20x20']);
});

test.describe("reflow at 320 px", () => {
  test.skip(({ isMobile }) => !isMobile, "run once, on the phone project");
  test.use({ viewport: { width: 320, height: 640 } });
  for (const state of STATES) {
    test(`320 px: ${state.name}`, async ({ page, guard }, testInfo) => {
      await open(page, guard, state);
      const w = await width(page);
      save(testInfo, `reflow-320-${state.name}`, { state: state.name, url: page.url(), width: w });
      expect(w.scrollWidth, "page width at 320 px").toBeLessThanOrEqual(w.clientWidth);
      expect(w.clientWidth).toBe(320);
    });
  }
});

// Which of Leaflet's animations a map has switched on: tile fading (a class
// on the map), zoom animation (Leaflet's zoom proxy element) and marker zoom
// animation (a class on each marker).
const mapAnimates = (page, selector) =>
  page
    .locator(selector)
    .evaluate((el) =>
      [
        el.classList.contains("leaflet-fade-anim") && "fade",
        !!el.querySelector(".leaflet-proxy") && "zoom",
        !!el.querySelector(".leaflet-marker-icon.leaflet-zoom-animated") && "markers",
      ].filter(Boolean),
    );

async function motionState(page) {
  await page.goto("/camps");
  await showListMap(page);
  const list = await mapAnimates(page, "#cluster-map");
  await page.goto(await campPath(page, MEMBER.campTitle));
  await page.locator("#map").scrollIntoViewIfNeeded();
  await expect(page.locator("#map .camp-pin")).toHaveCount(1);
  const camp = await mapAnimates(page, "#map");
  const carousel = await page.locator(".carousel-item.active").evaluate((el) => ({
    duration: getComputedStyle(el).transitionDuration,
    autoplay: el.closest(".carousel").getAttribute("data-bs-ride"),
  }));
  const scroll = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior,
  );
  return { list, camp, carousel, scroll };
}

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("with reduced motion the maps and the photo carousel do not animate", async ({
    page,
  }, testInfo) => {
    const state = await motionState(page);
    save(testInfo, "reduced-motion", state);
    expect(state.list).toEqual([]);
    expect(state.camp).toEqual([]);
    expect(state.carousel.autoplay).toBeNull();
    expect(parseFloat(state.carousel.duration)).toBeLessThan(0.001);
    expect(state.scroll).toBe("auto");
  });
});

test.describe("without reduced motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("without reduced motion the maps animate (the check above can fail)", async ({
    page,
  }, testInfo) => {
    const state = await motionState(page);
    save(testInfo, "motion-allowed", state);
    expect(state.list).toEqual(["fade", "zoom", "markers"]);
    expect(state.camp).toEqual(["fade", "zoom", "markers"]);
    expect(parseFloat(state.carousel.duration)).toBeGreaterThan(0.1);
  });
});
