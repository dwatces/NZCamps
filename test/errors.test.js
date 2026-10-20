// X8: friendly error pages and empty states.
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

let db;
let app;
let campId;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  const agent = h.agentFor(app);
  await agent.signUp();
  campId = h.campIdFrom(await agent.createCamp({ title: "Bare Camp" }));
  assert.ok(campId);
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

// Mounts a throwing route just before the 404 handler, runs fn, then removes it.
async function withBoom(error, fn) {
  const stack = app._router.stack;
  app.get("/__boom", () => {
    throw error;
  });
  const layer = stack.pop();
  const at = stack.findIndex((l) => l.route && l.route.path === "*");
  stack.splice(at, 0, layer);
  try {
    return await fn();
  } finally {
    stack.splice(stack.indexOf(layer), 1);
  }
}

test("an unknown address is a 404 page with a way back", async () => {
  const res = await h.agentFor(app).get("/nope");
  assert.equal(res.status, 404);
  assert.match(res.text, /<h1[^>]*>Page not found<\/h1>/);
  assert.match(res.text, /<a [^>]*href="\/camps"[^>]*>All camps<\/a>/);
  assert.match(res.text, /<a [^>]*href="\/"[^>]*>Home<\/a>/);
  assert.match(res.text, /<footer/, "uses the shared layout");
});

test("a 500 in production shows no stack, class name or internal message", async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const realError = console.error;
  console.error = () => {};
  try {
    const res = await withBoom(new TypeError("cannot read secretField of undefined"), () =>
      h.agentFor(app).get("/__boom"),
    );
    assert.equal(res.status, 500);
    assert.match(res.text, /<h1[^>]*>Something went wrong<\/h1>/);
    assert.match(res.text, /href="\/camps"[^>]*>All camps/);
    for (const leak of ["TypeError", "secretField", "<pre", "at Layer", "index.js"]) {
      assert.ok(!res.text.includes(leak), `no ${leak}`);
    }
  } finally {
    process.env.NODE_ENV = saved;
    console.error = realError;
  }
});

test("only local development shows the stack, in a scrolling block", async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const realError = console.error;
  console.error = () => {};
  try {
    const res = await withBoom(new Error("dev-only detail"), () => h.agentFor(app).get("/__boom"));
    assert.equal(res.status, 500);
    assert.match(res.text, /<pre class="error-stack[^"]*"[^>]*>Error: dev-only detail/);
  } finally {
    process.env.NODE_ENV = saved;
    console.error = realError;
  }
});

test("a camp with no photos shows the placeholder, not an empty carousel", async () => {
  const page = await h.agentFor(app).get(`/camps/${campId}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /<img src="\/images\/no-photo\.svg" alt=""/);
  assert.match(page.text, /No photo yet/);
  assert.doesNotMatch(page.text, /carousel/);
  const list = await h.agentFor(app).get("/camps");
  assert.match(list.text, /Bare Camp/);
  assert.match(list.text, /no-photo\.svg/);
});

test("a camp with no reviews invites the first one", async () => {
  const page = await h.agentFor(app).get(`/camps/${campId}`);
  assert.match(page.text, /No reviews yet\. Be the first to leave one\./);
  assert.match(page.text, /href="\/login[^"]*"[^>]*>Log in to leave a review/);
});

test("the old personal Cloudinary fallback image is gone", h.notInBundle, () => {
  // Split so this file does not match its own search.
  const needle = "res.cloudinary.com/" + "dghtrpkzv";
  const res = spawnSync("git", ["grep", "-n", needle], {
    cwd: h.ROOT,
    encoding: "utf8",
  });
  assert.equal(res.stdout, "");
});
