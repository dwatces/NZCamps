// X4: camp page rating summary, prices, dates, authorship, the review prompt
// and a returnTo that cannot redirect off the site.
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");

let db;
let app;
let Camp;
let Review;
let User;
let owner;
let ownerUser;
let campId;

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const NZ_DATE = new RegExp(`\\b\\d{1,2} (${MONTHS}) \\d{4}\\b`);

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Camp = require("../models/camp");
  Review = require("../models/review");
  User = require("../models/user");
  owner = h.agentFor(app);
  ({ user: ownerUser } = await owner.signUp());
  campId = h.campIdFrom(await owner.createCamp({ title: "Rated Camp", price: "18.50" }));
  for (const rating of ["4", "5"]) {
    const reviewer = h.agentFor(app);
    await reviewer.signUp();
    await reviewer
      .post(`/camps/${campId}/reviews`)
      .type("form")
      .send({ "review[rating]": rating, "review[body]": `A ${rating} star stay.` });
  }
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

test("the rating summary averages the reviews", async () => {
  const html = (await h.agentFor(app).get(`/camps/${campId}`)).text;
  assert.match(html, /4\.5 \(2 reviews\)/);
  assert.match(html, /Rated 4\.5 out of 5 from 2 reviews/);
});

test("prices read as money: $18.50 a night, and Free for 0", async () => {
  assert.match((await h.agentFor(app).get(`/camps/${campId}`)).text, /\$18\.50 a night/);
  const free = h.campIdFrom(await owner.createCamp({ title: "Free Camp", price: "0" }));
  const html = (await h.agentFor(app).get(`/camps/${free}`)).text;
  assert.match(html, />Free</);
  assert.doesNotMatch(html, /\$0/);
});

test("the page names who added the camp and when", async () => {
  const html = (await h.agentFor(app).get(`/camps/${campId}`)).text;
  assert.match(
    html,
    new RegExp(`Added by ${ownerUser.username} on <time datetime="\\d{4}-\\d{2}-\\d{2}">`),
  );
  assert.match(html, NZ_DATE);
  assert.match(html, /<h1[^>]*>Rated Camp<\/h1>/);
});

test("reviews show the date they were posted", async () => {
  const html = (await h.agentFor(app).get(`/camps/${campId}`)).text;
  const reviews = html.slice(html.indexOf('id="reviews"'));
  assert.match(reviews, NZ_DATE);
});

test("older documents without createdAt use the time in their id", async () => {
  const author = await User.findOne({ username: ownerUser.username });
  const old = mongoose.Types.ObjectId.createFromTime(Date.UTC(2021, 6, 23, 0, 0, 0) / 1000);
  await Review.collection.insertOne({
    _id: old,
    body: "From 2021.",
    rating: 3,
    author: author._id,
  });
  const { insertedId } = await Camp.collection.insertOne({
    _id: mongoose.Types.ObjectId.createFromTime(Date.UTC(2021, 6, 22) / 1000),
    title: "Legacy Dates",
    location: "Wellington",
    price: 10,
    description: "Saved before timestamps.",
    geometry: { type: "Point", coordinates: [174.77, -41.28] },
    images: [],
    reviews: [old],
    author: author._id,
  });
  const html = (await h.agentFor(app).get(`/camps/${insertedId}`)).text;
  assert.match(html, /22 July 2021/);
  assert.match(html, /<time datetime="2021-07-23">23 July 2021<\/time>/);
});

test("sample listings say so instead of naming the seed account", async () => {
  const ranger = await User.create({ username: "ranger", email: "ranger@camps.example" });
  const camp = await Camp.create({
    title: "Seeded Sample",
    location: "Hahei",
    price: 15,
    description: "Demo campground: x",
    geometry: { type: "Point", coordinates: [175.8, -36.84] },
    author: ranger._id,
  });
  const html = (await h.agentFor(app).get(`/camps/${camp._id}`)).text;
  assert.match(html, /Added by: Sample listing, not a real campground/);
  assert.doesNotMatch(html, /ranger/);
});

test("signed out, the page offers a log in link that comes back here", async () => {
  const html = (await h.agentFor(app).get(`/camps/${campId}`)).text;
  assert.match(
    html,
    new RegExp(`href="/login\\?returnTo=%2Fcamps%2F${campId}"[^>]*>Log in to leave a review`),
  );
  assert.doesNotMatch(html, /action="\/camps\/[a-f0-9]+\/reviews"/, "no review form");
});

test("logging in from the prompt returns to the camp", async () => {
  const agent = h.agentFor(app);
  const { user } = await agent.signUp();
  await agent.logOut();
  const form = await agent.get(`/login?returnTo=%2Fcamps%2F${campId}`);
  assert.match(
    form.text,
    new RegExp(`<input type="hidden" name="returnTo" value="/camps/${campId}" />`),
  );
  assert.match(form.text, new RegExp(`href="/register\\?returnTo=%2Fcamps%2F${campId}"`));
  const res = await agent
    .post("/login")
    .type("form")
    .send({ username: user.username, password: user.password, returnTo: `/camps/${campId}` });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `/camps/${campId}`);
});

test("a failed log in keeps the returnTo", async () => {
  const agent = h.agentFor(app);
  const { user } = await agent.signUp();
  await agent.logOut();
  const res = await agent
    .post("/login")
    .type("form")
    .send({ username: user.username, password: "wrong-password", returnTo: `/camps/${campId}` });
  assert.equal(res.headers.location, `/login?returnTo=%2Fcamps%2F${campId}`);
});

test("signing up from the prompt also returns to the camp", async () => {
  const res = await h
    .agentFor(app)
    .post("/register")
    .type("form")
    .send({
      username: "returner",
      email: "returner@example.test",
      password: "long-enough-pw",
      returnTo: `/camps/${campId}`,
    });
  assert.equal(res.headers.location, `/camps/${campId}`);
});

test("returnTo cannot send anyone to another site", async () => {
  for (const bad of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/camps/../logout",
    "/camps/x?y=https://evil.example",
    "javascript:alert(1)",
  ]) {
    const form = await request(app).get(`/login?returnTo=${encodeURIComponent(bad)}`);
    assert.doesNotMatch(form.text, /name="returnTo"/, bad);
    const agent = h.agentFor(app);
    const { user } = await agent.signUp();
    await agent.logOut();
    const res = await agent
      .post("/login")
      .type("form")
      .send({ username: user.username, password: user.password, returnTo: bad });
    assert.equal(res.headers.location, "/camps", bad);
  }
});

test("opening the log in form with a returnTo stores no session", async () => {
  const res = await request(app).get(`/login?returnTo=%2Fcamps%2F${campId}`);
  assert.equal(res.headers["set-cookie"], undefined);
});

test("deleting a review or a camp asks first", async () => {
  const agent = h.agentFor(app);
  await agent.signUp();
  await agent
    .post(`/camps/${campId}/reviews`)
    .type("form")
    .send({ "review[rating]": "3", "review[body]": "Mine to delete." });
  const html = (await agent.get(`/camps/${campId}`)).text;
  assert.match(html, /data-confirm="Delete your review\?"/);
  const edit = (await owner.get(`/camps/${campId}/edit`)).text;
  assert.match(
    edit,
    /action="\/camps\/[a-f0-9]+\?_method=DELETE"[\s\S]*?data-confirm="Delete this camp/,
  );
  assert.match(edit, />Delete camp</);
});

test("ownership messages say what you can do", async () => {
  const other = h.agentFor(app);
  await other.signUp();
  await other.get(`/camps/${campId}/edit`);
  assert.match((await other.get(`/camps/${campId}`)).text, /You can only change camps you added\./);
  const [reviewId] = (await Camp.findById(campId).lean()).reviews;
  await other.post(`/camps/${campId}/reviews/${reviewId}?_method=DELETE`);
  assert.match(
    (await other.get(`/camps/${campId}`)).text,
    /You can only delete your own reviews\./,
  );
});
