// X3 with review C12: camps list search, sort, pages and card summary.
const h = require("./helpers");
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

let db;
let app;
let Camp;
let Review;
let User;

const point = { type: "Point", coordinates: [174.77, -41.28] };

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Camp = require("../models/camp");
  Review = require("../models/review");
  User = require("../models/user");
  const author = await User.create({ username: "list_author", email: "list@example.test" });
  const rate = async (...ratings) =>
    (
      await Review.insertMany(ratings.map((rating) => ({ body: "ok", rating, author: author._id })))
    ).map((r) => r._id);
  // 15 camps. Prices descend as they are added, so "newest" and "price" differ.
  const camps = [];
  for (let i = 1; i <= 12; i++) {
    camps.push({
      title: `Plain camp ${String(i).padStart(2, "0")}`,
      location: "Wellington",
      price: 100 - i,
    });
  }
  camps.push({
    title: "Lake TEKAPO Hideaway",
    location: "Canterbury",
    price: 40,
    reviews: await rate(4, 5),
  });
  camps.push({
    title: "Starlight Flat",
    location: "Lake Tekapo",
    price: 10,
    reviews: await rate(3),
  });
  camps.push({
    title: "Lake Taupō shore camp",
    location: "Taupō",
    price: 0,
    reviews: await rate(5, 5),
  });
  for (const c of camps) {
    await Camp.create({
      description: "A camp for the list tests.",
      geometry: point,
      author: author._id,
      ...c,
    });
  }
});

after(async () => {
  mongoose.set("debug", false);
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

const get = (url) => h.agentFor(app).get(url);
const titles = (html) =>
  [...html.matchAll(/class="camp-card__title"[^>]*>([^<]+)</g)].map((m) => m[1]);
const mapData = (html) => JSON.parse(/id="camps-data">([\s\S]*?)<\/script>/.exec(html)[1]);

test("12 camps per page: page 1 has 12, page 2 has 3", async () => {
  const one = await get("/camps");
  assert.equal(one.status, 200);
  assert.equal(titles(one.text).length, 12);
  assert.match(one.text, /15 camps/);
  assert.equal(mapData(one.text).length, 15, "the map shows every matching camp");
  const two = await get("/camps?page=2");
  assert.equal(titles(two.text).length, 3);
  assert.deepEqual(
    new Set([...titles(one.text), ...titles(two.text)]).size,
    15,
    "no camp on both pages",
  );
});

test("pagination is a labelled nav with the current page marked", async () => {
  const res = await get("/camps?page=2&sort=price");
  assert.match(res.text, /<nav aria-label="Pagination"/);
  assert.match(res.text, /href="\/camps\?sort=price&amp;page=2" aria-current="page"/);
  assert.match(res.text, /href="\/camps\?sort=price"[^>]*>Previous</);
  assert.equal((res.text.match(/aria-current="page"/g) || []).length, 1);
});

test("newest first is the default", async () => {
  assert.deepEqual(titles((await get("/camps")).text).slice(0, 3), [
    "Lake Taupō shore camp",
    "Starlight Flat",
    "Lake TEKAPO Hideaway",
  ]);
});

test("the search matches title or place, whatever the case", async () => {
  const res = await get("/camps?q=tekapo");
  assert.deepEqual(titles(res.text).sort(), ["Lake TEKAPO Hideaway", "Starlight Flat"]);
  assert.match(res.text, /2 camps match “tekapo”/);
  assert.match(res.text, /href="\/camps"[^>]*>Clear search</);
  assert.equal(mapData(res.text).length, 2);
});

test("a search without macrons finds places written with them", async () => {
  assert.deepEqual(titles((await get("/camps?q=taupo")).text), ["Lake Taupō shore camp"]);
  assert.deepEqual(titles((await get("/camps?q=Taup%C5%8D")).text), ["Lake Taupō shore camp"]);
});

test("search text is matched literally, not as a pattern", async () => {
  for (const q of [".*", "(", "[a-z]", "\\"]) {
    const res = await get(`/camps?q=${encodeURIComponent(q)}`);
    assert.equal(res.status, 200, q);
    assert.equal(titles(res.text).length, 0, q);
    assert.match(res.text, /No camps match/);
    assert.match(res.text, /Try a shorter name/);
  }
});

test("sort=price lists the cheapest first", async () => {
  const res = await get("/camps?sort=price");
  assert.deepEqual(titles(res.text).slice(0, 3), [
    "Lake Taupō shore camp",
    "Starlight Flat",
    "Lake TEKAPO Hideaway",
  ]);
  assert.match(res.text, /<option value="price" selected>/);
});

test("sort=rating puts the highest average first and unrated camps last", async () => {
  const res = await get("/camps?sort=rating");
  const t = titles(res.text);
  assert.deepEqual(t.slice(0, 3), [
    "Lake Taupō shore camp",
    "Lake TEKAPO Hideaway",
    "Starlight Flat",
  ]);
  assert.ok(t.slice(3).every((x) => x.startsWith("Plain camp")));
});

test("cards show place, price and a rating summary with a text alternative", async () => {
  const html = (await get("/camps?q=tekapo")).text;
  assert.match(html, /Canterbury<\/span>/);
  assert.match(html, /\$40 a night/);
  assert.match(html, /&#9733;<\/span> 4\.5 \(2 reviews\)/);
  assert.match(html, /<span class="visually-hidden">Rated 4\.5 out of 5 from 2 reviews<\/span>/);
  assert.match((await get("/camps?q=taupo")).text, /Free/);
  assert.match((await get("/camps?q=plain")).text, /No reviews yet/);
});

test("a page past the end shows an empty state, not an error", async () => {
  const res = await get("/camps?page=999");
  assert.equal(res.status, 200);
  assert.equal(titles(res.text).length, 0);
  assert.match(res.text, /Page 999 is past the end of the list/);
  assert.match(res.text, /href="\/camps"[^>]*>Go to page 1</);
});

describe("odd query strings fall back to the defaults", () => {
  for (const qs of [
    "q[]=x",
    "q=a&q=b",
    "page=abc",
    "page=-1",
    "page=1e9",
    "page=0",
    "sort=__proto__",
    "sort[]=price",
    "q[$ne]=x",
    `q=${"x".repeat(500)}`,
  ]) {
    test(qs.slice(0, 30), async () => {
      const res = await get(`/camps?${qs}`);
      assert.equal(res.status, 200);
    });
  }
  test("arrays and objects are ignored, not searched", async () => {
    const res = await get("/camps?q[]=tekapo&page=1e9");
    assert.equal(titles(res.text).length, 12);
  });
});

test("the list HTML stays small", async () => {
  const res = await get("/camps");
  assert.ok(Buffer.byteLength(res.text) <= 60 * 1024, `${Buffer.byteLength(res.text)} bytes`);
});

test("one /camps request makes at most 3 database calls, whatever the camp count", async () => {
  const calls = [];
  mongoose.set("debug", (collection, method) => calls.push(`${collection}.${method}`));
  try {
    await get("/camps");
    assert.ok(calls.length <= 3, `anonymous: ${calls.join(", ")}`);
    const agent = h.agentFor(app);
    await agent.signUp();
    calls.length = 0;
    await agent.get("/camps?sort=rating&q=camp");
    assert.ok(calls.length <= 3, `signed in: ${calls.join(", ")}`);
  } finally {
    mongoose.set("debug", false);
  }
});
