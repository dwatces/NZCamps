// X7 with review B3: a failed first connection is retried on the request
// path (no timers), at most once per back-off, and after it the session
// store works on the new client.
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const runtimeConfig = require("../utils/runtimeConfig");

let app;
let port;
let server;
let uri;

const BANNER = /Showing sample camps\. The database isn&#39;t reachable right now/;

before(async () => {
  // An OS-assigned port that is free again: start once, note it, stop.
  const probe = await MongoMemoryServer.create({ instance: { launchTimeout: 30000 } });
  port = probe.instanceInfo.port;
  await probe.stop({ doCleanup: true, force: true });
  runtimeConfig.serverSelectionTimeoutMS = 300;
  runtimeConfig.dbWaitMs = 3000;
  runtimeConfig.reconnectBackoffMs = 1000;
  uri = `mongodb://127.0.0.1:${port}/nzcamps-reconnect`;
  app = await h.makeApp({ dbUri: uri, waitForDb: false });
});

after(async () => {
  await h.closeApp();
  if (server) await server.stop({ doCleanup: true, force: true });
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("while the database is down, sample camps show with the banner", async () => {
  const res = await h.agentFor(app).get("/camps");
  assert.equal(res.status, 200);
  assert.match(res.text, /Milford Sound Basecamp/);
  assert.match(res.text, BANNER);
  assert.equal(mongoose.connection.readyState, 0);
});

test("within the back-off, requests do not try to connect again", async () => {
  const real = mongoose.connect;
  let attempts = 0;
  mongoose.connect = (...args) => {
    attempts++;
    return real.apply(mongoose, args);
  };
  try {
    await Promise.all([1, 2, 3].map(() => h.agentFor(app).get("/")));
    assert.equal(attempts, 0);
    await sleep(1100);
    // Three at once after the back-off: exactly one attempt between them.
    await Promise.all([1, 2, 3].map(() => h.agentFor(app).get("/")));
    assert.equal(attempts, 1);
  } finally {
    mongoose.connect = real;
  }
});

test("once the database is back, a request after the back-off reconnects", async () => {
  server = await MongoMemoryServer.create({ instance: { port, launchTimeout: 30000 } });
  const direct = await mongoose.createConnection(uri).asPromise();
  await direct.collection("camps").insertOne({
    title: "Back Online Camp",
    location: "Wellington",
    price: 10,
    description: "Added while the app was in demo mode.",
    geometry: { type: "Point", coordinates: [174.77, -41.28] },
    images: [],
    reviews: [],
  });
  await direct.close();
  const clientBefore = mongoose.connection.getClient();
  await sleep(1100);
  const res = await h.agentFor(app).get("/camps");
  assert.equal(res.status, 200);
  assert.match(res.text, /Back Online Camp/);
  assert.doesNotMatch(res.text, BANNER);
  assert.doesNotMatch(res.text, /Milford Sound Basecamp/);
  assert.equal(mongoose.connection.readyState, 1);
  assert.notEqual(mongoose.connection.getClient(), clientBefore, "a new client");
});

test("after the reconnect, sign up works and the session lasts", async () => {
  const agent = h.agentFor(app);
  const { res } = await agent.signUp();
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/camps");
  for (let i = 0; i < 2; i++) {
    const page = await agent.get("/camps/new");
    assert.equal(page.status, 200, `request ${i + 1} is still signed in`);
  }
  const store = app.locals.sessionState;
  assert.equal(store.client, mongoose.connection.getClient(), "session store on the new client");
});
