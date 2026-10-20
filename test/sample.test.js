// Sample listings are labelled as samples (X1 slice moved into foundation by review C1).
const h = require("./helpers");
const { test, before, after, describe } = require("node:test");
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

test("the seeder labels camps, is idempotent and refuses a remote database", h.notInBundle, () => {
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
  assert.match(first.stdout, /8 camps created/);
  assert.doesNotMatch(first.stdout, /seed-password/, "a supplied password is never printed");
  const second = run({ DB_URL: uri });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /0 camps created/);
});

test("the seeded camps keep their label and isDemo flag", h.notInBundle, async () => {
  const mongoose = require("mongoose");
  const conn = await mongoose.createConnection(db.server.getUri("nzcamps-seed")).asPromise();
  try {
    const camps = await conn.collection("camps").find({}).toArray();
    assert.equal(camps.length, 8);
    for (const c of camps) {
      assert.equal(c.isDemo, true);
      assert.match(c.description, /^Demo campground:/);
      assert.equal(typeof c._id, "object", "ObjectId, not the demo string id");
      assert.ok(
        c.images.length > 0 && c.images.every((i) => i.alt),
        `${c.title} photos have alt text`,
      );
    }
    assert.equal(await conn.collection("reviews").countDocuments(), 0, "no seeded reviews");
  } finally {
    await conn.close();
  }
});

test("isLoopbackDbUrl only accepts this machine", h.notInBundle, () => {
  const { isLoopbackDbUrl } = require("../seeds/seedAtlas");
  assert.equal(isLoopbackDbUrl("mongodb+srv://localhost/x"), false, "srv always resolves remotely");
  assert.equal(isLoopbackDbUrl("mongodb://127.0.0.1:27017/x"), true);
  assert.equal(isLoopbackDbUrl("mongodb://user:pw@localhost/x"), true);
  assert.equal(isLoopbackDbUrl("mongodb://[::1]:27017/x"), true);
  assert.equal(isLoopbackDbUrl("mongodb+srv://cluster0.example.net/x"), false);
  assert.equal(isLoopbackDbUrl("mongodb://127.0.0.1,db.example.net/x"), false);
  assert.equal(isLoopbackDbUrl("mongodb://localhost.evil.example/x"), false);
});

// X1: seeds/labelDemo.js, for Daniel to run against the live database himself.
describe("labelDemo.js", h.notInBundle, () => {
  const script = path.join(__dirname, "..", "seeds", "labelDemo.js");
  const guard = path.join(__dirname, "helpers", "guard.js");
  const run = (env, args = []) =>
    spawnSync(process.execPath, ["-r", guard, script, ...args], {
      env: { PATH: process.env.PATH, ...env },
      encoding: "utf8",
      timeout: 60000,
    });
  let uri;
  let conn;
  let ranger;
  let member;

  before(async () => {
    const mongoose = require("mongoose");
    uri = db.server.getUri("nzcamps-label");
    conn = await mongoose.createConnection(uri).asPromise();
    const users = conn.collection("users");
    ranger = (await users.insertOne({ username: "ranger", email: "r@camps.example" })).insertedId;
    member = (await users.insertOne({ username: "kea_fan", email: "k@example.test" })).insertedId;
    const camps = conn.collection("camps");
    const legacy = (title, author, images) => ({
      ...baseCamp,
      title,
      author,
      images,
      description: "Demo campground: legacy row.",
    });
    await camps.insertMany([
      // The live shape: copied by the old seeder, no isDemo, a photo from elsewhere.
      legacy("Tekapo Lakeside Pitch", ranger, [
        { url: "/stylesheets/casey-horner-_aVKjJhFdn0-unsplash.jpg" },
      ]),
      legacy("Milford Sound Basecamp", ranger, [
        { url: "/stylesheets/anderson-aguirre-bjTQqa6o_cM-unsplash.jpg" },
      ]),
      // A sample whose owner later uploaded a photo: its photos are left alone.
      legacy("Coromandel Cove Camp", ranger, [
        { url: "https://res.cloudinary.com/demo/image/upload/v1/NZCamps/x.jpg" },
      ]),
      legacy("Member Camp", member, []),
    ]);
  });

  after(async () => {
    await conn.close();
  });

  const snapshot = async () =>
    (await conn.collection("camps").find({}).sort({ title: 1 }).toArray()).map((c) => ({
      title: c.title,
      isDemo: c.isDemo,
      images: c.images,
    }));

  test("refuses a remote database without CONFIRM_REMOTE", () => {
    const res = run({ DB_URL: "mongodb+srv://example.invalid/x" });
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /CONFIRM_REMOTE=yes/);
  });

  test("a dry run counts and changes nothing", async () => {
    const before = await snapshot();
    const res = run({ DB_URL: uri }, ["--photos"]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /3 camps by "ranger" are not labelled/);
    assert.match(res.stdout, /2 sample camps have older photos/);
    assert.match(res.stdout, /Dry run/);
    assert.match(res.stdout, /Database: 127\.0\.0\.1/);
    assert.deepEqual(await snapshot(), before);
  });

  test("--apply labels only ranger's camps", async () => {
    const res = run({ DB_URL: uri }, ["--apply"]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Labelled 3 camps/);
    const camps = await snapshot();
    const flags = Object.fromEntries(camps.map((c) => [c.title, c.isDemo === true]));
    assert.deepEqual(flags, {
      "Coromandel Cove Camp": true,
      "Member Camp": false,
      "Milford Sound Basecamp": true,
      "Tekapo Lakeside Pitch": true,
    });
    const tekapo = camps.find((c) => c.title === "Tekapo Lakeside Pitch");
    assert.equal(tekapo.images[0].url, "/stylesheets/casey-horner-_aVKjJhFdn0-unsplash.jpg");
    assert.match(run({ DB_URL: uri }).stdout, /0 camps by "ranger"/, "a second run finds none");
  });

  test("--apply --photos refreshes repo photos and leaves uploads alone", async () => {
    const demo = require("../seeds/demoData");
    const res = run({ DB_URL: uri }, ["--apply", "--photos"]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Updated the photos of 2 sample camps/);
    const camps = await snapshot();
    for (const title of ["Tekapo Lakeside Pitch", "Milford Sound Basecamp"]) {
      const want = demo.find((d) => d.title === title).images;
      const got = camps.find((c) => c.title === title).images;
      assert.deepEqual(
        got.map(({ url, alt }) => ({ url, alt })),
        want.map(({ url, alt }) => ({ url, alt })),
        title,
      );
    }
    const coromandel = camps.find((c) => c.title === "Coromandel Cove Camp");
    assert.match(coromandel.images[0].url, /res\.cloudinary\.com/);
  });
});

test("maskedHost never prints a full remote host", h.notInBundle, () => {
  const { maskedHost } = require("../seeds/dbGuard");
  assert.equal(maskedHost("mongodb+srv://u:p@cluster0.ab12c.mongodb.net/x"), "***.mongodb.net");
  assert.equal(maskedHost("mongodb://127.0.0.1:27017/x"), "127.0.0.1");
});

// X1 / review C11: every sample photo is credited, in the module the site
// reads and in public/images/CREDITS.md, and the file exists.
test("every sample photo has a credit line and a file", h.notInBundle, () => {
  const fs = require("node:fs");
  const demo = require("../seeds/demoData");
  const { PHOTOS, samplePhoto } = require("../utils/samplePhotos");
  const root = path.join(__dirname, "..");
  const credits = fs.readFileSync(path.join(root, "public", "images", "CREDITS.md"), "utf8");
  const used = new Set(demo.flatMap((d) => d.images.map((i) => i.url)));
  assert.equal(used.size, 9, "nine photos across the eight samples");
  for (const url of used) {
    const p = samplePhoto(url);
    assert.ok(p, `${url} is in utils/samplePhotos.js`);
    assert.ok(p.alt && p.credit && /^https:\/\/unsplash\.com\/photos\//.test(p.page), url);
    const line = credits.split("\n").find((l) => l.includes(`\`${url}\``));
    assert.ok(line, `${url} has a line in CREDITS.md`);
    assert.ok(line.includes(p.credit) && line.includes(p.page), `${url} credit matches`);
    assert.ok(fs.existsSync(path.join(root, "public", url)), `${url} exists`);
  }
  for (const p of PHOTOS) assert.ok(used.has(p.url), `${p.url} is used by a sample`);
});
