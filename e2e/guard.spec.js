// Checks the checker: each kind of problem the fixtures watch for is caused
// on purpose here, and must be recorded. The record is then cleared so the
// test itself passes. Without this, a guard that saw nothing would look the
// same as a site with nothing wrong.
const { test, expect, findings, measureOpenPages, BLOCKED_HOSTS } = require("./fixtures");

test.skip(({ isMobile }) => isMobile, "the guard is the same at every width");

const recorded = (state) => expect.poll(() => findings(state).join("\n"), { timeout: 5_000 });

test.afterEach(({ guardState }) => {
  guardState.problems.length = 0;
  guardState.widths.length = 0;
});

test("the guard records a CSP violation", async ({ page, guardState }) => {
  await page.goto("/camps");
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.src = "https://images.example.com/not-allowed.png";
    img.alt = "";
    document.body.append(img);
  });
  await recorded(guardState).toContain("CSP violation on http://127.0.0.1:7203/camps: img-src");
});

test("the guard records an error status that was not expected", async ({ page, guardState }) => {
  await page.goto("/no-such-page");
  await recorded(guardState).toContain("404 for http://127.0.0.1:7203/no-such-page");
});

test("the guard records an uncaught script error", async ({ page, guardState }) => {
  await page.goto("/");
  await page.evaluate(() => setTimeout(() => window.__noSuchFunction(), 0));
  await recorded(guardState).toContain("Page error on http://127.0.0.1:7203/");
});

test("the guard records a console error", async ({ page, guardState }) => {
  await page.goto("/");
  await page.evaluate(() => console.error("guard check"));
  await recorded(guardState).toContain("Console error on http://127.0.0.1:7203/: guard check");
});

test("the guard records horizontal scrolling", async ({ page, context, guardState }) => {
  await page.goto("/camps");
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.id = "too-wide";
    wide.style.width = "3000px";
    wide.style.height = "1px";
    document.body.append(wide);
  });
  await measureOpenPages(context, guardState);
  await recorded(guardState).toContain("Horizontal scroll on http://127.0.0.1:7203/camps");
  // The guard measures open pages again when the test ends.
  await page.evaluate(() => document.getElementById("too-wide").remove());
});

test("blocked hosts are refused before any request leaves the browser", async ({
  page,
  guardState,
}) => {
  // The same rule covers danielolliver.com, olliverweb.co.nz and unsplash.com;
  // only unsplash.com is used for the live check, so a broken rule could
  // never send a request to Daniel's own sites.
  for (const host of ["danielolliver.com", "www.danielolliver.com", "olliverweb.co.nz"]) {
    expect(BLOCKED_HOSTS.test(host), host).toBe(true);
  }
  expect(BLOCKED_HOSTS.test("notdanielolliver.com")).toBe(false);
  const error = await page.goto("https://unsplash.com/").then(
    () => "",
    (err) => err.message,
  );
  expect(error).toContain("net::ERR_BLOCKED_BY_CLIENT");
  await recorded(guardState).toContain(
    "Request failed (net::ERR_BLOCKED_BY_CLIENT): https://unsplash.com/",
  );
});
