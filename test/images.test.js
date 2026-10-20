// X6 with review C13: photos stored in the camp document are served by their
// own route, never inlined into pages, and JPEG metadata is removed.
const h = require("./helpers");
const f = require("./helpers/files");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

let db;
let app;
let agent;
let Camp;
let bigId;
const BIG = f.bigPng(1_000_000);

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Camp = require("../models/camp");
  agent = h.agentFor(app);
  await agent.signUp();
  // Seven more camps, so /camps is measured with eight.
  for (let i = 1; i <= 7; i++) {
    assert.ok(h.campIdFrom(await agent.createCamp({ title: `Filler camp ${i}` })));
  }
  bigId = h.campIdFrom(
    await agent.createCamp({ title: "Big Photo Camp" }, [f.file(BIG, "big.png", "image/png")]),
  );
  assert.ok(bigId);
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

test("pages link to an uploaded photo instead of inlining it", async () => {
  const list = await agent.get("/camps");
  const show = await agent.get(`/camps/${bigId}`);
  const edit = await agent.get(`/camps/${bigId}/edit`);
  for (const [name, res, limit] of [
    ["/camps", list, 60 * 1024],
    ["camp page", show, 40 * 1024],
    ["edit page", edit, 40 * 1024],
  ]) {
    assert.equal(res.status, 200, name);
    assert.ok(!res.text.includes("base64,"), `${name} has no base64`);
    assert.ok(
      Buffer.byteLength(res.text) <= limit,
      `${name} is ${Buffer.byteLength(res.text)} bytes`,
    );
  }
  const image = (await Camp.findById(bigId).lean()).images[0];
  assert.ok(show.text.includes(`/camps/${bigId}/images/${image._id}`));
});

test("the image route returns the exact bytes with long-cache headers", async () => {
  const image = (await Camp.findById(bigId).lean()).images[0];
  const res = await request(app)
    .get(`/camps/${bigId}/images/${image._id}`)
    .buffer(true)
    .parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "image/png");
  assert.equal(
    res.headers["cache-control"],
    "public, max-age=31536000, s-maxage=31536000, immutable",
  );
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["set-cookie"], undefined, "no session for image requests");
  assert.ok(Buffer.compare(res.body, BIG) === 0, "exact bytes");
});

test("unknown, malformed and non-embedded image ids are 404s", async () => {
  const camp = await Camp.create({
    title: "Repo Photo",
    location: "Hahei",
    price: 15,
    description: "x",
    geometry: { type: "Point", coordinates: [175.8, -36.84] },
    images: [{ url: "/stylesheets/tyler-lastovich-MfRNe40ihls-unsplash.jpg" }],
  });
  const other = (await Camp.findById(bigId).lean()).images[0]._id;
  for (const p of [
    `/camps/${bigId}/images/000000000000000000000000`,
    `/camps/${bigId}/images/not-an-id`,
    `/camps/${camp._id}/images/${camp.images[0]._id}`,
    `/camps/${camp._id}/images/${other}`,
  ]) {
    const res = await request(app).get(p);
    assert.equal(res.status, 404, p);
    assert.notEqual(
      res.headers["cache-control"],
      "public, max-age=31536000, s-maxage=31536000, immutable",
    );
  }
});

test("a phone JPEG loses its GPS and IPTC data but keeps its orientation", async () => {
  const { readOrientation } = require("../utils/jpegMetadata");
  const { detectImageType } = require("../utils/imageType");
  const original = f.phoneJpeg({ orientation: 6 });
  assert.ok(original.includes("GPSLatitude"), "fixture carries GPS text");
  const id = h.campIdFrom(
    await agent.createCamp({ title: "Phone Photo" }, [f.file(original, "p.jpg", "image/jpeg")]),
  );
  const stored = (await Camp.findById(id).lean()).images[0].url;
  const bytes = Buffer.from(stored.split(",")[1], "base64");
  assert.equal(detectImageType(bytes), "image/jpeg");
  for (const needle of ["GPSLatitude", "Phone Model", "Photoshop 3.0", "IPTC"]) {
    assert.ok(!bytes.includes(needle), `no ${needle}`);
  }
  // APP0 first, then the rebuilt Exif block holding only the orientation.
  assert.deepEqual([...bytes.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  const app1 = bytes.indexOf(Buffer.from([0xff, 0xe1]));
  assert.ok(app1 > 0);
  assert.equal(readOrientation(bytes.subarray(app1 + 4)), 6);
  // The scan data is untouched.
  assert.ok(bytes.subarray(-202).equals(original.subarray(-202)));
});

test("an upright JPEG keeps no Exif block at all", () => {
  const { stripJpegMetadata } = require("../utils/jpegMetadata");
  const out = stripJpegMetadata(f.phoneJpeg({ orientation: 1 }));
  assert.equal(out.indexOf(Buffer.from([0xff, 0xe1])), -1);
  assert.equal(out.indexOf(Buffer.from([0xff, 0xed])), -1);
});

test("anything that does not parse as a JPEG is left alone", () => {
  const { stripJpegMetadata } = require("../utils/jpegMetadata");
  for (const buf of [f.JPEG, f.PNG, Buffer.from([0xff, 0xd8]), Buffer.alloc(0)]) {
    assert.equal(stripJpegMetadata(buf), buf);
  }
});
