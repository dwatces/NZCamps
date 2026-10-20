// X2: forms keep what was typed and say what went wrong, next to the field
// and in a summary that links to it.
const h = require("./helpers");
const f = require("./helpers/files");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

let db;
let app;
let Review;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Review = require("../models/review");
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

const flat = (html) => html.replace(/\s+/g, " ");
const tagWithId = (html, tag, id) => {
  const m = new RegExp(`<${tag}[^>]*\\bid="${id}"[^>]*>`).exec(flat(html));
  assert.ok(m, `<${tag} id="${id}">`);
  return m[0];
};
const errorText = (html, name) => {
  const m = new RegExp(`<p class="field-error" id="${name}-error">([^<]*)</p>`).exec(flat(html));
  return m ? m[1].trim() : null;
};

async function signedIn() {
  const agent = h.agentFor(app);
  await agent.signUp();
  return agent;
}

test("a bad price keeps the typed values and ties the message to the field", async () => {
  const agent = await signedIn();
  const res = await agent.createCamp({
    title: "Kept Title",
    description: "Kept description text.",
    price: "12.345",
  });
  assert.equal(res.status, 422);
  assert.match(res.text, /value="Kept Title"/);
  assert.match(res.text, /Kept description text\./);
  const price = tagWithId(res.text, "input", "price");
  assert.match(price, /aria-describedby="price-help price-error"/);
  assert.match(price, /aria-invalid="true"/);
  assert.match(price, /class="form-control is-invalid"/);
  assert.equal(
    errorText(res.text, "price"),
    "Enter a price per night, like 18 or 18.50. Use 0 for free.",
  );
  assert.doesNotMatch(tagWithId(res.text, "input", "title"), /aria-invalid/);
});

test("the summary is an alert that takes focus and links to each field", async () => {
  const agent = await signedIn();
  const res = await agent.createCamp({ title: "", price: "abc" });
  const summary = tagWithId(res.text, "div", "form-errors");
  assert.match(summary, /role="alert"/);
  assert.match(summary, /tabindex="-1"/);
  assert.match(res.text, /<a href="#title">Enter a camp name\.<\/a>/);
  assert.match(res.text, /<a href="#price">Enter a price per night/);
  assert.equal(errorText(res.text, "title"), "Enter a camp name.");
});

test("a place that can't be found is reported at the location field", async () => {
  const agent = await signedIn();
  const res = await agent.createCamp({ title: "Lost", location: "Nowhere" });
  assert.equal(res.status, 422);
  assert.match(errorText(res.text, "location"), /couldn&#39;t find that location/);
  assert.match(res.text, /<a href="#location">/);
  assert.match(
    tagWithId(res.text, "input", "location"),
    /aria-describedby="location-help location-error"/,
  );
});

test("a refused photo is reported at the photo field", async () => {
  const agent = await signedIn();
  const res = await agent.createCamp({ title: "Bad Photo" }, [
    f.file(f.HTML, "x.png", "image/png"),
  ]);
  assert.equal(res.status, 422);
  assert.match(errorText(res.text, "image"), /Photos must be JPG, PNG or WebP/);
  assert.match(res.text, /<a href="#image">/);
});

test("a problem with no field of its own is listed without a link", async () => {
  const agent = await signedIn();
  const res = await agent.createCamp({ author: "000000000000000000000000" });
  assert.equal(res.status, 422);
  assert.match(res.text, /<li>The form had an unexpected field\.<\/li>/);
});

test("the review form has no pre-chosen rating and requires one", async () => {
  const agent = await signedIn();
  const id = h.campIdFrom(await agent.createCamp({ title: "Review Form" }));
  const html = flat((await agent.get(`/camps/${id}`)).text);
  assert.doesNotMatch(html, /value="0"/);
  assert.doesNotMatch(html, /name="review\[rating\]"[^>]*checked/);
  assert.match(tagWithId(html, "input", "rating-1"), /required/);
  assert.match(html, /<legend[^>]*>Your rating<\/legend>/);
});

test("a review without a rating keeps its text and asks for the stars", async () => {
  const agent = await signedIn();
  const id = h.campIdFrom(await agent.createCamp({ title: "Rate Me" }));
  const res = await agent
    .post(`/camps/${id}/reviews`)
    .type("form")
    .send({ "review[body]": "Lovely spot by the river." });
  assert.equal(res.status, 422);
  assert.match(res.text, /Lovely spot by the river\./);
  assert.equal(errorText(res.text, "rating"), "Choose a star rating from 1 to 5.");
  assert.match(
    flat(res.text),
    /<fieldset class="mb-3" role="radiogroup" aria-describedby="rating-error" aria-invalid="true">/,
  );
  assert.match(res.text, /<a href="#rating-1">Choose a star rating/);
  assert.match(res.text, /<h1[^>]*>Rate Me<\/h1>/, "the camp page itself");
  assert.equal(await Review.countDocuments({ body: "Lovely spot by the river." }), 0);
});

test("a review without text keeps the chosen rating", async () => {
  const agent = await signedIn();
  const id = h.campIdFrom(await agent.createCamp({ title: "Keep Stars" }));
  const res = await agent
    .post(`/camps/${id}/reviews`)
    .type("form")
    .send({ "review[rating]": "4", "review[body]": "  " });
  assert.equal(res.status, 422);
  assert.match(tagWithId(res.text, "input", "rating-4"), /checked/);
  assert.equal(errorText(res.text, "body"), "Enter your review.");
  assert.match(tagWithId(res.text, "textarea", "review-body"), /aria-invalid="true"/);
});

test("a duplicate username keeps the username and email, never the password", async () => {
  const first = h.agentFor(app);
  const { user } = await first.signUp();
  const res = await h
    .agentFor(app)
    .post("/register")
    .type("form")
    .send({ username: user.username, email: "another@example.test", password: "a-new-password" });
  assert.equal(res.status, 422);
  assert.match(tagWithId(res.text, "input", "username"), new RegExp(`value="${user.username}"`));
  assert.match(tagWithId(res.text, "input", "email"), /value="another@example\.test"/);
  assert.doesNotMatch(tagWithId(res.text, "input", "password"), /value=/);
  assert.ok(!res.text.includes("a-new-password"));
  assert.match(res.text, /That username or email is already registered\./);
});

test("sign up problems are shown at each field", async () => {
  const res = await h
    .agentFor(app)
    .post("/register")
    .type("form")
    .send({ username: "ok_name", email: "not-an-email", password: "short" });
  assert.equal(res.status, 422);
  assert.equal(errorText(res.text, "email"), "Enter a valid email address, like name@example.com.");
  assert.equal(errorText(res.text, "password"), "Choose a password of at least 8 characters.");
  assert.match(
    tagWithId(res.text, "input", "password"),
    /aria-describedby="password-help password-error"/,
  );
  assert.match(res.text, /<a href="#email">/);
  assert.equal(errorText(res.text, "username"), null);
});

test("every client-checked field carries its plain-English message", async () => {
  const agent = await signedIn();
  const html = flat((await agent.get("/camps/new")).text);
  for (const [id, message] of [
    ["title", "Enter a camp name."],
    ["location", "Enter a location."],
    ["price", "Enter a price per night, like 18 or 18.50. Use 0 for free."],
  ]) {
    assert.match(
      tagWithId(html, "input", id),
      new RegExp(`data-error="${message.replace(/[.]/g, "\\.")}"`),
    );
  }
  assert.match(tagWithId(html, "textarea", "description"), /data-error="Enter a description\."/);
  assert.match(html, /<script defer src="\/js\/forms\.js"><\/script>/);
  assert.doesNotMatch(html, /validateForms/);
});
