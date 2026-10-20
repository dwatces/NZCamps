// F3: no personal data in pages, and user text cannot become script.
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let db;
let app;
let campId;
let user;

const HOSTILE_TITLE = "<img src=x onerror=window.__x=1>";
const HOSTILE_DESC = "</script><script>window.__y=1</script>";

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  const agent = h.agentFor(app);
  ({ user } = await agent.signUp());
  campId = h.campIdFrom(
    await agent.createCamp({ title: HOSTILE_TITLE, description: HOSTILE_DESC }),
  );
  assert.ok(campId);
  await agent
    .post(`/camps/${campId}/reviews`)
    .type("form")
    .send({ "review[rating]": "5", "review[body]": "</script><b>bold</b>" });
});

after(async () => {
  await h.closeApp(app);
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

function jsonBlocks(html) {
  return [
    ...html.matchAll(/<script type="application\/json" id="[^"]+">([\s\S]*?)<\/script>/g),
  ].map((m) => m[1]);
}

for (const page of ["/camps", "/camps/:id"]) {
  test(`${page} publishes no email, hash, salt or __v`, async () => {
    const res = await h.agentFor(app).get(page.replace(":id", campId));
    assert.equal(res.status, 200);
    for (const needle of ['"email"', user.email, '"hash"', '"salt"', '"__v"', "JSON.stringify"]) {
      assert.ok(!res.text.includes(needle), `${page} must not contain ${needle}`);
    }
  });

  test(`${page} keeps hostile text inert`, async () => {
    const res = await h.agentFor(app).get(page.replace(":id", campId));
    const blocks = jsonBlocks(res.text);
    assert.equal(blocks.length, 1, "one JSON data block");
    assert.ok(!/[<>&]/.test(blocks[0]), "no raw <, > or & inside the data block");
    const data = JSON.parse(blocks[0]);
    const camp = Array.isArray(data) ? data.find((c) => c.id === campId) : data;
    assert.equal(camp.title, HOSTILE_TITLE, "the text survives as data");
    assert.deepEqual(Object.keys(camp).sort(), ["id", "lat", "lng", "location", "price", "title"]);
    assert.ok(!res.text.includes("<script>window.__y=1"), "no script breakout");
    assert.ok(!res.text.includes("<img src=x onerror"), "the title is escaped in HTML");
    assert.ok(!res.text.includes("<b>bold</b>"), "review text is escaped");
  });
}

test("a review whose author was deleted still renders (Former member)", async () => {
  const User = require("../models/user");
  const agent = h.agentFor(app);
  const { user: gone } = await agent.signUp();
  await agent
    .post(`/camps/${campId}/reviews`)
    .type("form")
    .send({ "review[rating]": "3", "review[body]": "Soon to be orphaned." });
  await User.deleteOne({ username: gone.username });
  const res = await h.agentFor(app).get(`/camps/${campId}`);
  assert.equal(res.status, 200);
  assert.match(res.text, /Former member/);
});

test("the thumbnail virtual only rewrites Cloudinary URLs", () => {
  const Camp = require("../models/camp");
  const camp = new Camp({
    images: [
      { url: "https://res.cloudinary.com/demo/image/upload/v1/NZCamps/a.jpg" },
      { url: "data:image/png;base64,AAAA/upload/BBBB" },
      { url: "/stylesheets/x.jpg" },
    ],
  });
  assert.equal(
    camp.images[0].thumbnail,
    "https://res.cloudinary.com/demo/image/upload/w_200/v1/NZCamps/a.jpg",
  );
  assert.equal(camp.images[1].thumbnail, "data:image/png;base64,AAAA/upload/BBBB");
  assert.equal(camp.images[2].thumbnail, "/stylesheets/x.jpg");
});

test("safeJson escapes everything that could end a script block", () => {
  const { safeJson } = require("../utils/viewHelpers");
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  const text = "</script><!--&" + LS + PS;
  const out = safeJson({ s: text });
  for (const ch of ["<", ">", "&", LS, PS]) assert.ok(!out.includes(ch), `escaped ${ch}`);
  assert.deepEqual(JSON.parse(out), { s: text });
});

test("no template serialises data with <%- JSON", () => {
  const views = path.join(__dirname, "..", "views");
  const walk = (d) =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(views)) {
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /<%-\s*JSON/, f);
  }
});

test("an email-shaped username is shown as NZ Camps member and never printed", async () => {
  const User = require("../models/user");
  const Camp = require("../models/camp");
  const Review = require("../models/review");
  const legacy = new User({ username: "someone@example.test", email: "someone@example.test" });
  await User.register(legacy, "legacy-password");
  const review = await Review.create({ body: "Old review.", rating: 4, author: legacy._id });
  await Camp.updateOne({ _id: campId }, { $push: { reviews: review._id } });

  for (const page of [`/camps/${campId}`, "/camps"]) {
    const res = await h.agentFor(app).get(page);
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes("someone@example.test"), `${page} must not print the address`);
  }
  assert.match((await h.agentFor(app).get(`/camps/${campId}`)).text, /NZ Camps member/);
});
