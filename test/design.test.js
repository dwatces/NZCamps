// Design stage (D1 to D9): page structure, metadata, images, header and
// footer, and the markup the layout and accessibility work relies on.
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

let db;
let app;
let campId;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  const agent = h.agentFor(app);
  await agent.signUp();
  campId = h.campIdFrom(await agent.createCamp({ title: "Design Camp" }));
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

const tags = (html, re) => [...html.matchAll(re)].map((m) => m[0]);

// ---------- D5: images ----------

test("every file the image manifest names exists", h.notInBundle, () => {
  const manifest = require("../utils/images.json");
  const sets = [
    ...Object.values(manifest.photos),
    manifest.hero.portrait,
    manifest.hero.wide,
    manifest.backdrop.tall,
    manifest.auth,
  ];
  for (const set of sets) {
    for (const w of set.avif) {
      const f = path.join(h.ROOT, "public", `${set.name}-${w}.avif`);
      assert.ok(fs.existsSync(f), f);
    }
    for (const w of set.jpeg) {
      const f = path.join(h.ROOT, "public", `${set.name}-${w}.jpg`);
      assert.ok(fs.existsSync(f), f);
    }
  }
  assert.ok(fs.existsSync(path.join(h.ROOT, "public", manifest.og.url)));
});

test("every sample photo has responsive variants", () => {
  const manifest = require("../utils/images.json");
  for (const p of require("../utils/samplePhotos").PHOTOS) {
    assert.ok(manifest.photos[p.url], p.url);
  }
});

test("the original photo addresses the live database uses still load", h.notInBundle, async () => {
  for (const url of [
    "/stylesheets/anderson-aguirre-bjTQqa6o_cM-unsplash.jpg",
    "/stylesheets/casey-horner-_aVKjJhFdn0-unsplash.jpg",
    "/stylesheets/tyler-lastovich-MfRNe40ihls-unsplash.jpg",
  ]) {
    const res = await request(app).get(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers["content-type"], "image/jpeg", url);
  }
});

test("AVIF variants are served as image/avif", h.notInBundle, async () => {
  const res = await request(app).get("/images/mitchell-luo-1200.avif");
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "image/avif");
});

test("pages preload no photos they do not show", async () => {
  for (const p of ["/camps", `/camps/${campId}`, "/login", "/register", "/nope"]) {
    const res = await request(app).get(p);
    assert.deepEqual(tags(res.text, /<link rel="preload"[^>]*>/g), [], p);
  }
});

test("photo and backdrop originals stay out of page markup", async () => {
  for (const p of ["/", "/camps", `/camps/${campId}`, "/login"]) {
    const res = await request(app).get(p);
    assert.doesNotMatch(res.text, /mitchell-luo-CEowgw6VXbE|casey-horner-_aVKjJhFdn0/, p);
  }
});
