const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

let app;

before(async () => {
  app = await h.makeApp({ dbUri: null });
});

after(() => {
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

test("without DB_URL, /camps lists the sample camps", async () => {
  const res = await h.agentFor(app).get("/camps");
  assert.equal(res.status, 200);
  assert.match(res.text, /Milford Sound Basecamp/);
  assert.match(res.text, /Tekapo Lakeside Pitch/);
});

test("without DB_URL, all eight sample camp pages render", async () => {
  const demo = require("../seeds/demoData");
  assert.equal(demo.length, 8);
  for (let n = 1; n <= 8; n++) {
    const res = await h.agentFor(app).get(`/camps/demo${n}`);
    assert.equal(res.status, 200, `demo${n}`);
    assert.ok(res.text.includes(demo[n - 1].title.replace(/&/g, "&amp;")), `demo${n} title`);
    assert.match(res.text, /Sample listing/);
  }
});

test("sample photos have real alt text and a credit", async () => {
  const res = await h.agentFor(app).get("/camps/demo1");
  assert.match(res.text, /alt="A quiet sealed road through tall beech forest"/);
  assert.match(res.text, /Photo: <a href="https:\/\/unsplash\.com\/photos\/bjTQqa6o_cM"/);
  assert.doesNotMatch(res.text, /alt="\.\.\."/);
});

// X7 changed this from a flash and a redirect to the same 503 page an outage
// gives, with copy that is true for a copy of the app with no database.
test("without DB_URL, writes are refused with an honest message", async () => {
  const res = await h.agentFor(app).post("/register").type("form").send({ username: "x" });
  assert.equal(res.status, 503);
  assert.match(res.text, /has no database connected, so you can browse sample camps but not save/);
  assert.doesNotMatch(res.text, /provisioned/);
});

test("without DB_URL, every page shows the sample-camps banner", async () => {
  for (const p of ["/", "/camps", "/camps/demo3", "/login"]) {
    const res = await h.agentFor(app).get(p);
    assert.match(
      res.text,
      /<p class="demo-banner[^"]*">Showing sample camps\. This copy of NZ Camps has no database connected, so you can browse but not save changes\.<\/p>/,
      p,
    );
  }
});

test("without DB_URL, an unknown camp is a quick 404", async () => {
  const started = Date.now();
  const res = await h.agentFor(app).get("/camps/0123456789abcdef01234567");
  assert.equal(res.status, 404);
  assert.ok(Date.now() - started < 2000, "no wait for a database");
});

test("without DB_URL, every sample camp carries the Sample listing badge", async () => {
  const res = await h.agentFor(app).get("/camps");
  const demo = require("../seeds/demoData");
  const badges = res.text.match(/Sample listing<\/span>/g) || [];
  assert.equal(badges.length, demo.length);
  assert.match((await h.agentFor(app).get("/camps/demo2")).text, /Sample listing/);
});

test("without DB_URL, search, sort and pages work on the sample camps", async () => {
  const tekapo = await h.agentFor(app).get("/camps?q=tekapo");
  assert.match(tekapo.text, /1 camp matches “tekapo”/);
  assert.match(tekapo.text, /Tekapo Lakeside Pitch/);
  assert.doesNotMatch(tekapo.text, /Milford Sound Basecamp/);
  const cheap = await h.agentFor(app).get("/camps?sort=price");
  assert.ok(
    cheap.text.indexOf("Hokitika Gorge sample site") < cheap.text.indexOf("Kaikōura coast"),
  );
  assert.match(cheap.text, /Free/);
  assert.equal((await h.agentFor(app).get("/camps/?page=abc")).status, 200);
});

test("without DB_URL, HEAD requests are reads, not refused writes", async () => {
  assert.equal((await h.agentFor(app).head("/camps")).status, 200);
  assert.equal((await h.agentFor(app).head("/camps/demo2")).status, 200);
});

// D3: the photo credits page needs no database.
test("without DB_URL, the photo credits page renders with the banner", async () => {
  const res = await h.agentFor(app).get("/credits");
  assert.equal(res.status, 200);
  assert.match(res.text, /<h1[^>]*>Photo credits<\/h1>/);
  assert.match(res.text, /<p class="demo-banner[^"]*">Showing sample camps\./);
  assert.match(res.text, /Robert Koorenny/);
});
