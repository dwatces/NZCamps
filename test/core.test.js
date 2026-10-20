const h = require("./helpers");
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");

let db;
let app;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

describe("pages render", () => {
  for (const [path, text] of [
    ["/", "New Zealand Camps"],
    ["/camps", "Explore camps"],
    ["/login", 'action="/login"'],
    ["/register", 'action="/register"'],
  ]) {
    test(`GET ${path}`, async () => {
      const res = await h.agentFor(app).get(path);
      assert.equal(res.status, 200);
      assert.match(res.text, new RegExp(text.replace(/[/]/g, "\\/")));
    });
  }

  test("unknown path is a 404", async () => {
    const res = await h.agentFor(app).get("/no-such-page");
    assert.equal(res.status, 404);
  });
});

describe("accounts", () => {
  test("sign up, log out, then log in again", async () => {
    const agent = h.agentFor(app);
    const { user, res } = await agent.signUp();
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/camps");

    const signedIn = await agent.get("/camps/new");
    assert.equal(signedIn.status, 200, "signed-in user can open the new camp form");

    await agent.logOut();
    const signedOut = await agent.get("/camps/new");
    assert.equal(signedOut.status, 302, "signed-out user is sent to log in");
    assert.equal(signedOut.headers.location, "/login");

    const login = await agent.logIn(user.username, user.password);
    assert.equal(login.status, 302);
    assert.notEqual(login.headers.location, "/login");
    assert.equal((await agent.get("/camps/new")).status, 200);
  });

  test("wrong password does not sign in", async () => {
    const agent = h.agentFor(app);
    const { user } = await agent.signUp();
    await agent.logOut();
    const res = await agent.logIn(user.username, "not-the-password");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/login");
  });
});

describe("camps and reviews", () => {
  test("create a camp, review it, then delete it with its reviews", async () => {
    const Camp = require("../models/camp");
    const Review = require("../models/review");
    const agent = h.agentFor(app);
    await agent.signUp();

    const created = await agent.createCamp({ title: "Integration Flat" });
    assert.equal(created.status, 302);
    const id = h.campIdFrom(created);
    assert.ok(id, `redirects to the new camp (got ${created.headers.location})`);

    const camp = await Camp.findById(id).lean();
    assert.deepEqual(camp.geometry.coordinates, [174.7762, -41.2865], "stub geocoder used");

    const show = await agent.get(`/camps/${id}`);
    assert.equal(show.status, 200);
    assert.match(show.text, /Integration Flat/);

    const review = await agent
      .post(`/camps/${id}/reviews`)
      .type("form")
      .send({ "review[rating]": "4", "review[body]": "Sheltered and quiet." });
    assert.equal(review.status, 302);
    assert.equal(review.headers.location, `/camps/${id}`);
    assert.match((await agent.get(`/camps/${id}`)).text, /Sheltered and quiet\./);
    const reviewIds = (await Camp.findById(id).lean()).reviews;
    assert.equal(reviewIds.length, 1);

    const del = await agent.post(`/camps/${id}?_method=DELETE`);
    assert.equal(del.status, 302);
    assert.equal(await Camp.countDocuments({ _id: id }), 0);
    assert.equal(await Review.countDocuments({ _id: { $in: reviewIds } }), 0, "reviews cascade");
  });

  test("another user cannot delete someone else's camp", async () => {
    const Camp = require("../models/camp");
    const owner = h.agentFor(app);
    await owner.signUp();
    const id = h.campIdFrom(await owner.createCamp({ title: "Owner Only" }));

    const other = h.agentFor(app);
    await other.signUp();
    await other.post(`/camps/${id}?_method=DELETE`);
    assert.equal(await Camp.countDocuments({ _id: id }), 1);
  });

  test("another user cannot open the edit form or change someone else's camp", async () => {
    const Camp = require("../models/camp");
    const owner = h.agentFor(app);
    await owner.signUp();
    const id = h.campIdFrom(await owner.createCamp({ title: "Owner's Camp", price: "12" }));

    const other = h.agentFor(app);
    await other.signUp();
    const form = await other.get(`/camps/${id}/edit`);
    assert.equal(form.status, 302);
    assert.equal(form.headers.location, `/camps/${id}`);

    const update = await other
      .post(`/camps/${id}?_method=PUT`)
      .field("camp[title]", "Taken over")
      .field("camp[location]", "Wellington")
      .field("camp[price]", "99")
      .field("camp[description]", "Not yours to change.");
    assert.equal(update.status, 302);
    assert.equal(update.headers.location, `/camps/${id}`);
    const camp = await Camp.findById(id).lean();
    assert.equal(camp.title, "Owner's Camp");
    assert.equal(camp.price, 12);
  });

  test("the author can delete their own review, and the camp page updates", async () => {
    const Camp = require("../models/camp");
    const Review = require("../models/review");
    const agent = h.agentFor(app);
    await agent.signUp();
    const id = h.campIdFrom(await agent.createCamp({ title: "Review Removal Flat" }));
    await agent
      .post(`/camps/${id}/reviews`)
      .type("form")
      .send({ "review[rating]": "2", "review[body]": "Changed my mind about this." });
    const [reviewId] = (await Camp.findById(id).lean()).reviews;
    assert.match((await agent.get(`/camps/${id}`)).text, /Changed my mind about this\./);

    const del = await agent.post(`/camps/${id}/reviews/${reviewId}?_method=DELETE`);
    assert.equal(del.status, 302);
    assert.equal(del.headers.location, `/camps/${id}`);
    assert.equal(await Review.countDocuments({ _id: reviewId }), 0);
    assert.deepEqual((await Camp.findById(id).lean()).reviews, []);
    const page = (await agent.get(`/camps/${id}`)).text;
    assert.match(page, /Review deleted\./);
    assert.match(page, /No reviews yet/);
    assert.doesNotMatch(page, /Changed my mind about this/);
  });

  test("another user cannot delete someone else's review", async () => {
    const Camp = require("../models/camp");
    const Review = require("../models/review");
    const author = h.agentFor(app);
    await author.signUp();
    const id = h.campIdFrom(await author.createCamp({ title: "Kept Review Flat" }));
    await author
      .post(`/camps/${id}/reviews`)
      .type("form")
      .send({ "review[rating]": "5", "review[body]": "Staying put." });
    const [reviewId] = (await Camp.findById(id).lean()).reviews;

    const other = h.agentFor(app);
    await other.signUp();
    const res = await other.post(`/camps/${id}/reviews/${reviewId}?_method=DELETE`);
    assert.equal(res.status, 302);
    assert.equal(await Review.countDocuments({ _id: reviewId }), 1);
    assert.equal((await Camp.findById(id).lean()).reviews.length, 1);
  });
});
