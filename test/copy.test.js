// X9: accounts and copy in plain NZ English.
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

// The opening tag of the input with this id.
function inputTag(html, id) {
  const m = new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`).exec(html.replace(/\s+/g, " "));
  assert.ok(m, `input #${id}`);
  return m[0];
}

test("log in fields support autofill", async () => {
  const html = (await h.agentFor(app).get("/login")).text;
  assert.match(inputTag(html, "username"), /type="text"/);
  assert.match(inputTag(html, "username"), /autocomplete="username"/);
  assert.match(inputTag(html, "password"), /type="password"/);
  assert.match(inputTag(html, "password"), /autocomplete="current-password"/);
  assert.match(html, /<h1[^>]*>Log in<\/h1>/);
  assert.match(html, /New here\? <a href="\/register">Sign up<\/a>/);
});

test("sign up fields support autofill and explain the rules", async () => {
  const html = (await h.agentFor(app).get("/register")).text;
  assert.match(inputTag(html, "username"), /autocomplete="username"/);
  assert.match(inputTag(html, "username"), /aria-describedby="username-help"/);
  assert.match(inputTag(html, "email"), /type="email"/);
  assert.match(inputTag(html, "email"), /autocomplete="email"/);
  assert.match(inputTag(html, "password"), /type="password"/);
  assert.match(inputTag(html, "password"), /autocomplete="new-password"/);
  assert.match(inputTag(html, "password"), /aria-describedby="password-help"/);
  assert.match(html, /id="password-help"[^>]*>At least 8 characters\.</);
  assert.doesNotMatch(html, /autofocus/, "no autofocus on sign up");
  assert.match(html, /<h1[^>]*>Sign up<\/h1>/);
  assert.match(html, /Already have an account\? <a href="\/login">Log in<\/a>/);
});

test("pages are marked as New Zealand English", async () => {
  for (const p of ["/", "/camps", "/login", "/nope"]) {
    const res = await h.agentFor(app).get(p);
    assert.match(res.text, /<html lang="en-NZ">/, p);
  }
});

test("the nav says Log in, Sign up, Add a camp and Log out", async () => {
  const agent = h.agentFor(app);
  const out = (await agent.get("/camps")).text;
  assert.match(out, />Log in</);
  assert.match(out, />Sign up</);
  await agent.signUp();
  const signedIn = (await agent.get("/camps")).text;
  assert.match(signedIn, />Add a camp</);
  assert.match(signedIn, />Log out</);
  assert.doesNotMatch(signedIn, /New Camp/);
});

test("no template uses Login, Logout or Register as a label", h.notInBundle, () => {
  const views = path.join(h.ROOT, "views");
  const walk = (d) =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(views)) {
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), />\s*(login|logout|register)\s*</i, f);
  }
});

test("flash messages are sentence case and name the user", async () => {
  const agent = h.agentFor(app);
  const { user } = await agent.signUp();
  await agent.logOut();
  assert.match((await agent.get("/camps")).text, /You&#39;ve logged out\./);
  await agent.logIn(user.username, user.password);
  assert.match((await agent.get("/camps")).text, new RegExp(`Welcome back, ${user.username}\\.`));
});

test("the log in prompt says what it is for", async () => {
  const agent = h.agentFor(app);
  await agent.get("/camps/new");
  assert.match((await agent.get("/login")).text, /Log in to add a camp\./);
  const other = h.agentFor(app);
  await other.get("/camps/000000000000000000000000/edit");
  assert.match((await other.get("/login")).text, /Log in to continue\./);
});

test("an email-shaped username is welcomed as NZ Camps member", async () => {
  const User = require("../models/user");
  await User.register(new User({ username: "kea@example.test", email: "kea@example.test" }), "pw");
  const agent = h.agentFor(app);
  await agent.logIn("kea@example.test", "pw");
  const html = (await agent.get("/camps")).text;
  assert.match(html, /Welcome back, NZ Camps member\./);
  assert.ok(!html.includes("kea@example.test"));
});
