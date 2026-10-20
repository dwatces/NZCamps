// The Playwright `test` every spec uses. Each browser context:
// - answers OpenStreetMap tile requests with a flat local tile, so the maps
//   work offline and the public tile servers are never loaded;
// - refuses any request to danielolliver.com, olliverweb.co.nz or
//   unsplash.com (footer and photo credit links are never followed);
// - records console errors, uncaught page errors, content security policy
//   violations, failed requests, error responses and horizontal scrolling on
//   every page it opens.
// When the test ends, anything recorded fails it. A test that visits a page
// which should answer with an error (the 404 page, say) declares it first
// with guard.allow(/\/nope$/, 404).
const fs = require("node:fs");
const path = require("node:path");
const base = require("@playwright/test");
const { PORTS, MEMBER } = require("./constants");

const { expect } = base;
const TILE = fs.readFileSync(path.join(__dirname, "fixtures", "tile.png"));
const BLOCKED_HOSTS = /(^|\.)(danielolliver\.com|olliverweb\.co\.nz|unsplash\.com)$/;
const DEMO_URL = `http://127.0.0.1:${PORTS.demo}`;

// Runs in every page before its own scripts. Reports CSP violations as they
// happen, and the page's width once it has loaded.
function pageProbe() {
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__e2eReport({
      kind: "csp",
      url: location.href,
      text: `${e.violatedDirective} blocked ${e.blockedURI || "inline"}`,
    });
  });
  addEventListener("load", () => {
    setTimeout(() => {
      const root = document.documentElement;
      window.__e2eReport({
        kind: "width",
        url: location.href,
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
      });
    }, 100);
  });
}

async function guardContext(context, state) {
  await context.route(
    (url) => BLOCKED_HOSTS.test(url.hostname),
    (route) => route.abort("blockedbyclient"),
  );
  await context.route(
    (url) => /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname),
    (route) => route.fulfill({ status: 200, contentType: "image/png", body: TILE }),
  );
  await context.exposeBinding("__e2eReport", (_source, report) => {
    if (report.kind === "csp")
      state.problems.push(`CSP violation on ${report.url}: ${report.text}`);
    if (report.kind === "width") state.widths.push(report);
  });
  await context.addInitScript(pageProbe);

  const watch = (page) => {
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const where = msg.location().url || page.url();
      // Chrome logs a document's own error status; allowed statuses are fine.
      if (/^Failed to load resource/.test(msg.text()) && state.isAllowed(where)) return;
      state.problems.push(`Console error on ${page.url()}: ${msg.text()}`);
    });
    page.on("pageerror", (err) => state.problems.push(`Page error on ${page.url()}: ${err}`));
    page.on("response", (res) => {
      if (res.status() >= 400 && !state.isAllowed(res.url(), res.status())) {
        state.problems.push(`${res.status()} for ${res.url()}`);
      }
    });
    page.on("requestfailed", (req) => {
      const reason = req.failure() ? req.failure().errorText : "";
      // Leaving a page cancels what it was still loading (lazy photos).
      if (reason === "net::ERR_ABORTED" && !req.isNavigationRequest()) return;
      state.problems.push(`Request failed (${reason}): ${req.url()}`);
    });
  };
  context.pages().forEach(watch);
  context.on("page", watch);
}

// What the guard has recorded so far, as one list of readable problems.
function findings(state) {
  const scrolling = state.widths
    .filter((w) => w.scrollWidth > w.clientWidth)
    .map((w) => `Horizontal scroll on ${w.url}: ${w.scrollWidth}px in ${w.clientWidth}px`);
  return [...state.problems, ...scrolling];
}

// Measures every open page now (the last page's own report may not be in yet).
async function measureOpenPages(context, state) {
  for (const page of context.pages()) {
    if (page.isClosed()) continue;
    await page.waitForTimeout(150);
    const now = await page
      .evaluate(() => ({
        url: location.href,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      .catch(() => null);
    if (now) state.widths.push(now);
  }
}

const test = base.test.extend({
  guardState: async ({}, use) => {
    const allowed = [
      // Browsers ask for /favicon.ico on their own; the site links its icons
      // from /images and /stylesheets instead.
      { url: /\/favicon\.ico$/, status: 404 },
    ];
    await use({
      problems: [],
      widths: [],
      allowed,
      isAllowed: (url, status) =>
        allowed.some((a) => a.url.test(url) && (status === undefined || a.status === status)),
    });
  },

  context: async ({ context, guardState }, use) => {
    await guardContext(context, guardState);
    await use(context);
  },

  guard: [
    async ({ context, guardState }, use) => {
      await use({
        allow: (url, status) => guardState.allowed.push({ url, status }),
      });
      await measureOpenPages(context, guardState);
      expect(findings(guardState), "console, CSP, request and width problems").toEqual([]);
    },
    { auto: true },
  ],
});

// ---- Helpers shared by the specs ----

const isPhone = (page) => page.viewportSize().width < 768;

// Opens the collapsed header menu on a phone; a no-op on a wide screen.
async function openMenu(page) {
  if (!isPhone(page)) return;
  const toggle = page.getByRole("button", { name: "Menu" });
  if ((await toggle.getAttribute("aria-expanded")) === "true") return;
  await toggle.click();
  await expect(page.locator("#site-menu")).toHaveClass(/show/);
}

async function headerLink(page, name) {
  await openMenu(page);
  return page.locator(".site-header").getByRole("link", { name, exact: true });
}

async function logIn(page, username = MEMBER.username, password = MEMBER.password) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.locator("main").getByRole("button", { name: "Log in" }).click();
  await expect(page.locator(".alert-success")).toContainText("Welcome back");
}

async function logOut(page) {
  await openMenu(page);
  await page.locator(".site-header").getByRole("button", { name: "Log out" }).click();
  await expect(page.locator(".alert-success")).toContainText("You've logged out.");
}

// A username nobody has used yet in this server's database.
function freshName(testInfo, prefix = "e2e") {
  const project = testInfo.project.name.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return `${prefix}_${project}_${Date.now().toString(36)}`.slice(0, 30);
}

async function signUp(page, username) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@example.test`);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.locator("main").getByRole("button", { name: "Sign up" }).click();
  await expect(page.locator(".alert-success")).toContainText(`Welcome to NZ Camps, ${username}`);
}

// Shows the camps map (the Map toggle on a phone) and waits for its markers
// (or, for an empty list, for the map itself).
async function showListMap(page, { markers = true } = {}) {
  if (isPhone(page)) await page.getByRole("button", { name: "Map", exact: true }).click();
  const map = page.locator("#cluster-map");
  await expect(map).toBeVisible();
  if (markers) await expect(map.locator(".leaflet-marker-icon").first()).toBeVisible();
  else await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  return map;
}

// Single pins plus the counts on cluster markers, and the number of camps in
// the page's map data: the two must match.
async function markerTotals(page) {
  return page.evaluate(() => {
    const data = JSON.parse(document.getElementById("camps-data").textContent);
    const pins = document.querySelectorAll("#cluster-map .camp-pin").length;
    const clustered = [...document.querySelectorAll("#cluster-map .camp-cluster__count")].reduce(
      (sum, el) => sum + Number(el.firstElementChild.textContent),
      0,
    );
    return { data: data.length, shown: pins + clustered };
  });
}

// The camp page's map data (title, place and coordinates).
const campData = (page) =>
  page.evaluate(() => JSON.parse(document.getElementById("camp-data").textContent));

module.exports = {
  test,
  findings,
  measureOpenPages,
  BLOCKED_HOSTS,
  expect,
  DEMO_URL,
  isPhone,
  openMenu,
  headerLink,
  logIn,
  logOut,
  signUp,
  freshName,
  showListMap,
  markerTotals,
  campData,
};
