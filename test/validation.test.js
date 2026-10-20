// F2: crash paths, validation, status codes and error messages.
const h = require("./helpers");
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let db;
let app;
let Camp;
let Review;
let User;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Camp = require("../models/camp");
  Review = require("../models/review");
  User = require("../models/user");
});

after(async () => {
  await h.closeApp(app);
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

// Every crash test is followed by a second request to prove the process lives.
async function stillServing() {
  const res = await h.agentFor(app).get("/camps");
  assert.equal(res.status, 200, "server still answers");
}

async function signedInWithCamp(fields) {
  const agent = h.agentFor(app);
  const { user } = await agent.signUp();
  const id = h.campIdFrom(await agent.createCamp(fields));
  assert.ok(id);
  return { agent, user, id };
}

describe("missing and malformed ids answer 404 without crashing", () => {
  test("edit form for a missing camp, signed in", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const res = await agent.get("/camps/000000000000000000000000/edit");
    assert.equal(res.status, 404);
    await stillServing();
  });

  test("update and delete of a missing camp, signed in", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    assert.equal((await agent.post("/camps/000000000000000000000000?_method=DELETE")).status, 404);
    const put = await agent
      .post("/camps/000000000000000000000000?_method=PUT")
      .field("camp[title]", "x");
    assert.equal(put.status, 404);
    await stillServing();
  });

  for (const p of ["/camps/not-an-id", "/camps/undefined/edit", "/camps/aaaaaaaaaaaa"]) {
    test(`GET ${p}`, async () => {
      const agent = h.agentFor(app);
      await agent.signUp();
      assert.equal((await agent.get(p)).status, 404);
      await stillServing();
    });
  }

  test("a missing camp page is a 404, not a redirect", async () => {
    const res = await h.agentFor(app).get("/camps/000000000000000000000000");
    assert.equal(res.status, 404);
    assert.match(res.text, /<h1[^>]*>Page not found<\/h1>/);
  });

  test("deleting a missing review", async () => {
    const { agent, id } = await signedInWithCamp();
    const res = await agent.post(`/camps/${id}/reviews/000000000000000000000000?_method=DELETE`);
    assert.equal(res.status, 404);
    await stillServing();
  });

  test("a review on a missing camp", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const res = await agent
      .post("/camps/000000000000000000000000/reviews")
      .type("form")
      .send({ "review[rating]": "3", "review[body]": "Lost." });
    assert.equal(res.status, 404);
    await stillServing();
  });

  test("a review can only be deleted through its own camp", async () => {
    const { agent, id: campA } = await signedInWithCamp({ title: "Camp A" });
    const campB = h.campIdFrom(await agent.createCamp({ title: "Camp B" }));
    await agent
      .post(`/camps/${campA}/reviews`)
      .type("form")
      .send({ "review[rating]": "5", "review[body]": "Lovely." });
    const [reviewId] = (await Camp.findById(campA).lean()).reviews;
    const res = await agent.post(`/camps/${campB}/reviews/${reviewId}?_method=DELETE`);
    assert.equal(res.status, 404);
    assert.equal(await Review.countDocuments({ _id: reviewId }), 1);
  });

  test("an error before the session middleware still renders the error page", async () => {
    // Insert a failing middleware right after the locals defaults.
    const stack = app._router.stack;
    const at = stack.findIndex(
      (l) => l.handle && /res\.locals\.user = null/.test(String(l.handle)),
    );
    assert.ok(at > 0, "found the locals defaults middleware");
    app.use("/__boom", () => {
      throw new Error("store exploded: mongodb://secret@host");
    });
    stack.splice(at + 1, 0, stack.pop());
    const res = await h.agentFor(app).get("/__boom");
    assert.equal(res.status, 500);
    assert.match(res.text, /<h1[^>]*>Something went wrong<\/h1>/);
    assert.doesNotMatch(res.text.replace(/<pre[\s\S]*?<\/pre>/g, ""), /store exploded/);
    stack.splice(at + 1, 1);
  });
});

describe("camp forms", () => {
  test("a create with a bad price re-renders the form with 422 and keeps the title", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const res = await agent.createCamp({ title: "Kept Title", price: "$20" });
    assert.equal(res.status, 422);
    assert.match(res.text, /value="Kept Title"/);
    assert.match(res.text, /Enter a price per night, like 18 or 18\.50\. Use 0 for free\./);
    assert.doesNotMatch(res.text, /undefined\/edit/);
    assert.doesNotMatch(res.text, /"camp\.price"/, "no raw Joi text");
    await stillServing();
  });

  test("a failed update re-renders the edit form with 422", async () => {
    const { agent, id } = await signedInWithCamp({ title: "Before" });
    const res = await agent
      .post(`/camps/${id}?_method=PUT`)
      .field("camp[title]", "After")
      .field("camp[location]", "Wellington")
      .field("camp[price]", "12.345")
      .field("camp[description]", "Still here.");
    assert.equal(res.status, 422);
    assert.match(res.text, /value="After"/);
    assert.match(res.text, new RegExp(`action="/camps/${id}\\?_method=PUT"`));
    assert.equal((await Camp.findById(id).lean()).title, "Before", "nothing saved");
  });

  test("location not found re-renders the form with what was typed", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const res = await agent.createCamp({ title: "Lost Camp", location: "Nowhere" });
    assert.equal(res.status, 422);
    assert.match(res.text, /couldn&#39;t find that location/);
    assert.match(res.text, /value="Lost Camp"/);
  });

  test("a geocoder failure gives a plain message, not the error text", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const real = app.locals.geocode;
    app.locals.geocode = async () => {
      throw new Error("ECONNRESET api.opencagedata.com key=abc");
    };
    try {
      const res = await agent.createCamp({ title: "Offline" });
      assert.equal(res.status, 503);
      assert.match(res.text, /couldn&#39;t check that location right now/);
      assert.doesNotMatch(res.text, /ECONNRESET|opencagedata/);
    } finally {
      app.locals.geocode = real;
    }
  });

  test("only the four form fields can be set (no mass assignment)", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const other = new User({ username: "someone_else", email: "else@example.test" });
    await User.register(other, "password-123");
    const res = await agent.createCamp({ author: String(other._id) });
    assert.equal(res.status, 422);
    assert.equal(await Camp.countDocuments({ author: other._id }), 0);
  });

  test("the price is stored as a number", async () => {
    const { id } = await signedInWithCamp({ price: "18.50" });
    const camp = await Camp.findById(id).lean();
    assert.equal(camp.price, 18.5);
    assert.equal(typeof camp.price, "number");
  });

  test("a URL-encoded update (no multipart body) does not crash", async () => {
    const { agent, id } = await signedInWithCamp({ title: "Plain Form" });
    const res = await agent.post(`/camps/${id}?_method=PUT`).type("form").send({
      "camp[title]": "Plain Form 2",
      "camp[location]": "Wellington",
      "camp[price]": "10",
      "camp[description]": "Edited without a file field.",
    });
    assert.equal(res.status, 302);
    assert.equal((await Camp.findById(id).lean()).title, "Plain Form 2");
  });

  test("a legacy-shaped camp (no filename on images) loads, edits and saves", async () => {
    const agent = h.agentFor(app);
    const { user } = await agent.signUp();
    const author = await User.findOne({ username: user.username });
    const { insertedId } = await Camp.collection.insertOne({
      title: "Legacy Camp",
      images: [{ url: "/stylesheets/casey-horner-_aVKjJhFdn0-unsplash.jpg" }],
      geometry: { type: "Point", coordinates: [170.47, -44.0] },
      price: 22,
      description: "Seeded before validation existed.",
      location: "Lake Tekapo",
      author: author._id,
      reviews: [],
    });
    assert.equal((await agent.get(`/camps/${insertedId}`)).status, 200);
    assert.equal((await agent.get(`/camps/${insertedId}/edit`)).status, 200);
    const res = await agent
      .post(`/camps/${insertedId}?_method=PUT`)
      .field("camp[title]", "Legacy Camp")
      .field("camp[location]", "Lake Tekapo")
      .field("camp[price]", "25")
      .field("camp[description]", "Edited.");
    assert.equal(res.status, 302);
    assert.equal((await Camp.findById(insertedId).lean()).price, 25);
  });
});

describe("Joi rules", () => {
  const { campSchema, registerSchema } = require("../schemas");
  const camp = (over) => ({
    camp: { title: "T", location: "L", price: "10", description: "D", ...over },
  });

  for (const bad of ["12.345", "-1", "1e2", "$20", "1001", "", "  ", undefined]) {
    test(`price ${JSON.stringify(bad)} is rejected with the plain message`, () => {
      const { error } = campSchema.validate(camp({ price: bad }));
      assert.ok(error);
      assert.match(error.details[0].message, /price/i);
      assert.doesNotMatch(error.details[0].message, /"camp\.price"/);
    });
  }
  for (const [good, n] of [
    ["0", 0],
    ["18", 18],
    ["18.50", 18.5],
    ["1000", 1000],
  ]) {
    test(`price ${good} is accepted as the number ${n}`, () => {
      const { error, value } = campSchema.validate(camp({ price: good }));
      assert.equal(error, undefined);
      assert.equal(value.camp.price, n);
    });
  }

  test("an over-length title is rejected", () => {
    assert.ok(campSchema.validate(camp({ title: "x".repeat(101) })).error);
    assert.equal(campSchema.validate(camp({ title: "x".repeat(100) })).error, undefined);
  });

  test("deleteImages is capped", () => {
    const many = Array.from({ length: 21 }, (_, i) => `img${i}`);
    assert.ok(campSchema.validate({ ...camp(), deleteImages: many }).error);
  });

  test("usernames cannot contain @ and passwords need 8 characters", () => {
    const ok = { username: "kea_fan", email: "kea@example.test", password: "longenough" };
    assert.equal(registerSchema.validate(ok).error, undefined);
    assert.ok(registerSchema.validate({ ...ok, username: "kea@example.test" }).error);
    assert.ok(registerSchema.validate({ ...ok, password: "short" }).error);
    assert.ok(registerSchema.validate({ ...ok, email: "not-an-email" }).error);
  });
});

describe("accounts", () => {
  test("a duplicate email shows a plain message, not E11000", async () => {
    const first = h.agentFor(app);
    const { user } = await first.signUp();
    const res = await h
      .agentFor(app)
      .post("/register")
      .type("form")
      .send({ username: "different_name", email: user.email, password: "password-123" });
    assert.equal(res.status, 422);
    assert.match(res.text, /That username or email is already registered\./);
    assert.doesNotMatch(res.text, /E11000|email_1|dup key/);
  });

  test("a username with @ cannot be registered", async () => {
    const res = await h
      .agentFor(app)
      .post("/register")
      .type("form")
      .send({ username: "me@example.test", email: "me@example.test", password: "password-123" });
    assert.equal(res.status, 422);
    assert.equal(await User.countDocuments({ username: "me@example.test" }), 0);
  });

  test("an existing user with an @ username and a short password can still log in", async () => {
    await User.register(
      new User({ username: "old@example.test", email: "old@example.test" }),
      "abc",
    );
    const res = await h.agentFor(app).logIn("old@example.test", "abc");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/camps");
  });

  test("a signed-out review submit does not become the after-login page", async () => {
    const { id } = await signedInWithCamp();
    const agent = h.agentFor(app);
    const { user } = await agent.signUp();
    await agent.logOut();
    const post = await agent
      .post(`/camps/${id}/reviews`)
      .type("form")
      .send({ "review[rating]": "4", "review[body]": "Nice." });
    assert.equal(post.headers.location, "/login");
    const login = await agent.logIn(user.username, user.password);
    assert.equal(login.headers.location, "/camps");
  });
});

test('no res.redirect("back") is left in the code', () => {
  const root = path.join(__dirname, "..");
  for (const dir of ["controllers", "routes"]) {
    for (const f of fs.readdirSync(path.join(root, dir))) {
      const src = fs.readFileSync(path.join(root, dir, f), "utf8");
      assert.doesNotMatch(src, /redirect\(\s*["']back["']\s*\)/, `${dir}/${f}`);
    }
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, "index.js"), "utf8"), /redirect\("back"\)/);
});
