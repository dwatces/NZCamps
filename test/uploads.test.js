// F5: upload limits, type checks and photo removal (data-URI mode). The
// byte-level type check and photo ownership are also in security.test.js.
const h = require("./helpers");
const f = require("./helpers/files");
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");

let db;
let app;
let Camp;
const RULES = /Photos must be JPG, PNG or WebP, up to 1\.4 MB each, 3 at most\./;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Camp = require("../models/camp");
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

async function signedIn() {
  const agent = h.agentFor(app);
  const { user } = await agent.signUp();
  return { agent, user };
}

describe("refused uploads keep the form", () => {
  test("a file declared as text/html is refused", async () => {
    const { agent } = await signedIn();
    const res = await agent.createCamp({ title: "Html Type" }, [
      f.file(f.HTML, "evil.html", "text/html"),
    ]);
    assert.equal(res.status, 422);
    assert.equal(await Camp.countDocuments({ title: "Html Type" }), 0);
  });

  test("four photos are refused and the typed values come back", async () => {
    const { agent } = await signedIn();
    const four = [1, 2, 3, 4].map((i) => f.file(f.PNG, `p${i}.png`, "image/png"));
    const res = await agent.createCamp(
      { title: "Too Many", description: "Kept description." },
      four,
    );
    assert.equal(res.status, 422);
    assert.match(res.text, RULES);
    assert.match(res.text, /value="Too Many"/);
    assert.match(res.text, /Kept description\./);
    assert.equal(await Camp.countDocuments({ title: "Too Many" }), 0);
  });

  test("a 1.5 MB photo is refused with the friendly message, not a 500", async () => {
    const { agent } = await signedIn();
    const res = await agent.createCamp({ title: "Big Photo" }, [
      f.file(f.bigPng(1.5 * 1024 * 1024), "big.png", "image/png"),
    ]);
    assert.equal(res.status, 422);
    assert.match(res.text, RULES);
    assert.match(res.text, /value="Big Photo"/);
  });

  test("a bad photo and a bad price are reported together", async () => {
    const { agent } = await signedIn();
    const res = await agent.createCamp({ title: "Two Problems", price: "abc" }, [
      f.file(f.HTML, "x.png", "image/png"),
    ]);
    assert.equal(res.status, 422);
    assert.match(res.text, RULES);
    assert.match(res.text, /Enter a price per night/);
  });
});

describe("accepted uploads", () => {
  test("three valid photos are stored as data URIs of their real type", async () => {
    const { agent } = await signedIn();
    const res = await agent.createCamp({ title: "Three Photos" }, [
      f.file(f.PNG, "a.png", "image/png"),
      f.file(f.JPEG, "b.png", "image/png"),
      f.file(f.WEBP, "c.webp", "image/webp"),
    ]);
    assert.equal(res.status, 302);
    const camp = await Camp.findById(h.campIdFrom(res)).lean();
    assert.equal(camp.images.length, 3);
    assert.ok(camp.images[0].url.startsWith("data:image/png;base64,"));
    assert.ok(camp.images[1].url.startsWith("data:image/jpeg;base64,"), "detected, not declared");
    assert.ok(camp.images[2].url.startsWith("data:image/webp;base64,"));
    assert.equal(camp.images[0].url, `data:image/png;base64,${f.PNG.toString("base64")}`);
  });

  test("no photo at all is fine", async () => {
    const { agent } = await signedIn();
    const res = await agent.createCamp({ title: "No Photos" });
    assert.equal(res.status, 302);
  });
});

describe("removing photos", () => {
  test("a seeded image with no filename can be removed", async () => {
    const User = require("../models/user");
    const { agent, user } = await signedIn();
    const author = await User.findOne({ username: user.username });
    const camp = await Camp.create({
      title: "Seeded Photo",
      location: "Hahei",
      price: 15,
      description: "Seeded.",
      geometry: { type: "Point", coordinates: [175.79, -36.83] },
      images: [{ url: "/stylesheets/tyler-lastovich-MfRNe40ihls-unsplash.jpg" }],
      author: author._id,
    });
    const imageId = String(camp.images[0]._id);
    const edit = await agent.get(`/camps/${camp._id}/edit`);
    assert.match(edit.text, new RegExp(`value="${imageId}"`), "the checkbox carries the image id");
    const res = await agent
      .post(`/camps/${camp._id}?_method=PUT`)
      .field("camp[title]", "Seeded Photo")
      .field("camp[location]", "Hahei")
      .field("camp[price]", "15")
      .field("camp[description]", "Seeded.")
      .field("deleteImages[]", imageId);
    assert.equal(res.status, 302);
    assert.equal((await Camp.findById(camp._id).lean()).images.length, 0);
  });

  test("deleteImages must be image ids", async () => {
    const { agent } = await signedIn();
    const id = h.campIdFrom(await agent.createCamp({ title: "Id Check" }));
    const res = await agent
      .post(`/camps/${id}?_method=PUT`)
      .field("camp[title]", "Id Check")
      .field("camp[location]", "Wellington")
      .field("camp[price]", "10")
      .field("camp[description]", "x")
      .field("deleteImages[]", "NZCamps/victim123");
    assert.equal(res.status, 422);
  });
});
