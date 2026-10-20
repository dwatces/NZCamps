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

test("without DB_URL, a sample camp page renders", async () => {
  const res = await h.agentFor(app).get("/camps/demo1");
  assert.equal(res.status, 200);
  assert.match(res.text, /Milford Sound Basecamp/);
});

test("without DB_URL, writes are refused", async () => {
  const res = await h.agentFor(app).post("/register").type("form").send({ username: "x" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/camps");
});

test("without DB_URL, every sample camp carries the Sample listing badge", async () => {
  const res = await h.agentFor(app).get("/camps");
  const demo = require("../seeds/demoData");
  const badges = res.text.match(/Sample listing<\/span>/g) || [];
  assert.equal(badges.length, demo.length);
  assert.match((await h.agentFor(app).get("/camps/demo2")).text, /Sample listing/);
});
