// F4 with review B3/B4: DB_URL set but the database unreachable. This used to
// crash the process (connect-mongo's unhandled rejection).
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const request = require("supertest");
const runtimeConfig = require("../utils/runtimeConfig");

let app;

async function closedPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

before(async () => {
  runtimeConfig.dbWaitMs = 300;
  runtimeConfig.serverSelectionTimeoutMS = 300;
  const port = await closedPort();
  app = await h.makeApp({ dbUri: `mongodb://127.0.0.1:${port}/nzcamps-test`, waitForDb: false });
});

after(async () => {
  await h.closeApp();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

test("the camps page shows the sample camps quickly", async () => {
  const started = Date.now();
  const res = await request(app).get("/camps");
  const elapsed = Date.now() - started;
  assert.equal(res.status, 200);
  assert.match(res.text, /Milford Sound Basecamp/);
  assert.match(res.text, /Showing sample camps\. The database isn&#39;t reachable right now/);
  assert.ok(elapsed < 2000, `answered in ${elapsed} ms`);
});

test("a visitor with a session cookie gets the samples and keeps their cookie", async () => {
  const res = await request(app)
    .get("/camps")
    .set("Cookie", "connect.sid=s%3Aexisting-session.signature");
  assert.equal(res.status, 200);
  assert.equal(res.headers["set-cookie"], undefined);
});

test("writes are refused with a 503 page and no cookie", async () => {
  const res = await request(app)
    .post("/login")
    .set("Cookie", "connect.sid=s%3Aexisting-session.signature")
    .type("form")
    .send({ username: "a", password: "b" });
  assert.equal(res.status, 503);
  assert.match(res.text, /isn&#39;t reachable right now/);
  assert.equal(res.headers["set-cookie"], undefined);
});

test("the server is still answering afterwards", async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal((await request(app).get("/")).status, 200);
});
