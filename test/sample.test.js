// Sample listings are labelled as samples (X1 slice moved into foundation by review C1).
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

let db;
let app;
let Camp;
let User;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Camp = require("../models/camp");
  User = require("../models/user");
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

const baseCamp = {
  location: "Lake Tekapo",
  price: 20,
  description: "A camp.",
  geometry: { type: "Point", coordinates: [170.47, -44.0] },
  images: [],
  reviews: [],
};

test("a camp by the seed account shows the Sample listing badge", async () => {
  const ranger = new User({ username: "ranger", email: "ranger@camps.example" });
  await User.register(ranger, "seed-password");
  const legacy = await Camp.create({ ...baseCamp, title: "Ranger Legacy", author: ranger._id });
  const page = await h.agentFor(app).get(`/camps/${legacy._id}`);
  assert.match(page.text, /Sample listing/);
  const list = await h.agentFor(app).get("/camps");
  assert.match(list.text, /Ranger Legacy[\s\S]*?Sample listing/);
  const data = JSON.parse(/id="camps-data">([\s\S]*?)<\/script>/.exec(list.text)[1]);
  assert.equal(data.find((c) => c.title === "Ranger Legacy").sample, true);
});

test("a camp by anyone else has no badge", async () => {
  const agent = h.agentFor(app);
  await agent.signUp();
  const id = h.campIdFrom(await agent.createCamp({ title: "Member Camp" }));
  const page = await h.agentFor(app).get(`/camps/${id}`);
  assert.doesNotMatch(page.text, /badge-sample/);
});

test("isDemo cannot be set from the form", async () => {
  const agent = h.agentFor(app);
  await agent.signUp();
  const res = await agent.createCamp({ title: "Sneaky", isDemo: "true" });
  assert.equal(res.status, 422);
  assert.equal(await Camp.countDocuments({ title: "Sneaky" }), 0);
});

test("the footer note is on every page", async () => {
  for (const p of ["/", "/camps", "/login", "/register"]) {
    const res = await h.agentFor(app).get(p);
    assert.match(res.text, /Listings marked Sample are invented examples/, p);
  }
});

test("seed usernames cannot be registered", async () => {
  for (const username of ["ranger", "Ranger", "demo-ranger"]) {
    const res = await h
      .agentFor(app)
      .post("/register")
      .type("form")
      .send({ username, email: `${username}@example.test`, password: "password-123" });
    assert.equal(res.status, 422, username);
  }
});

test("the seeder labels camps, is idempotent and refuses a remote database", () => {
  const seeder = path.join(__dirname, "..", "seeds", "seedAtlas.js");
  const guard = path.join(__dirname, "helpers", "guard.js");
  const run = (env) =>
    spawnSync(process.execPath, ["-r", guard, seeder], {
      env: { PATH: process.env.PATH, SEED_PASSWORD: "seed-password", ...env },
      encoding: "utf8",
      timeout: 60000,
    });

  const remote = run({ DB_URL: "mongodb+srv://example.invalid/x" });
  assert.notEqual(remote.status, 0);
  assert.match(remote.stderr, /CONFIRM_REMOTE=yes/);

  const uri = db.server.getUri("nzcamps-seed");
  const first = run({ DB_URL: uri });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /3 camps created/);
  assert.doesNotMatch(first.stdout, /seed-password/, "a supplied password is never printed");
  const second = run({ DB_URL: uri });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /0 camps created/);
});

test("the seeded camps keep their label and isDemo flag", async () => {
  const mongoose = require("mongoose");
  const conn = await mongoose.createConnection(db.server.getUri("nzcamps-seed")).asPromise();
  try {
    const camps = await conn.collection("camps").find({}).toArray();
    assert.equal(camps.length, 3);
    for (const c of camps) {
      assert.equal(c.isDemo, true);
      assert.match(c.description, /^Demo campground:/);
      assert.equal(typeof c._id, "object", "ObjectId, not the demo string id");
    }
    assert.equal(await conn.collection("reviews").countDocuments(), 0, "no seeded reviews");
  } finally {
    await conn.close();
  }
});

test("isLoopbackDbUrl only accepts this machine", () => {
  const { isLoopbackDbUrl } = require("../seeds/seedAtlas");
  assert.equal(isLoopbackDbUrl("mongodb://127.0.0.1:27017/x"), true);
  assert.equal(isLoopbackDbUrl("mongodb://user:pw@localhost/x"), true);
  assert.equal(isLoopbackDbUrl("mongodb://[::1]:27017/x"), true);
  assert.equal(isLoopbackDbUrl("mongodb+srv://cluster0.example.net/x"), false);
  assert.equal(isLoopbackDbUrl("mongodb://127.0.0.1,db.example.net/x"), false);
  assert.equal(isLoopbackDbUrl("mongodb://localhost.evil.example/x"), false);
});
