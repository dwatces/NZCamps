// F4: sessions, cookies, logout, returnTo and the cross-site write check.
const h = require("./helpers");
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

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

const sessionCount = () => mongoose.connection.db.collection("sessions").countDocuments();
const cookies = (res) => res.headers["set-cookie"] || [];

describe("session storage", () => {
  test("anonymous visits create no session and set no cookie", async () => {
    const beforeCount = await sessionCount();
    for (let i = 0; i < 5; i++) {
      for (const p of ["/", "/camps"]) {
        const res = await request(app).get(p);
        assert.equal(res.status, 200);
        assert.deepEqual(cookies(res), [], `${p} sets no cookie`);
      }
    }
    assert.equal(await sessionCount(), beforeCount);
  });

  test("sessions are stored in MongoDB on mongoose's own client", async () => {
    const agent = h.agentFor(app);
    const beforeCount = await sessionCount();
    await agent.signUp();
    assert.equal(await sessionCount(), beforeCount + 1);
    const { store, client } = app.locals.sessionState;
    assert.ok(store, "a Mongo session store exists");
    assert.equal(client, mongoose.connection.getClient());
    assert.equal(await store.clientP, mongoose.connection.getClient(), "one MongoClient");
  });
});

describe("session cookie", () => {
  test("is Secure behind an HTTPS proxy and still works over plain HTTP", async () => {
    const agent = h.agentFor(app);
    const { user } = await agent.signUp();
    await agent.logOut();

    const https = await request(app)
      .post("/login")
      .set("X-Forwarded-Proto", "https")
      .type("form")
      .send({ username: user.username, password: user.password });
    const httpsCookie = cookies(https).find((c) => c.startsWith("connect.sid="));
    assert.ok(httpsCookie, "cookie set over HTTPS");
    assert.match(httpsCookie, /; Secure/);
    assert.match(httpsCookie, /; HttpOnly/);
    assert.match(httpsCookie, /; SameSite=Lax/);

    const plain = await request(app)
      .post("/login")
      .type("form")
      .send({ username: user.username, password: user.password });
    const plainCookie = cookies(plain).find((c) => c.startsWith("connect.sid="));
    assert.ok(plainCookie, "cookie set over HTTP");
    assert.doesNotMatch(plainCookie, /; Secure/);
    assert.equal(plain.headers.location, "/camps");
  });

  test("responses do not advertise Express", async () => {
    const res = await request(app).get("/");
    assert.equal(res.headers["x-powered-by"], undefined);
  });
});

describe("logout and returnTo", () => {
  test("GET /logout does not log out; POST /logout does", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const get = await agent.get("/logout");
    assert.equal(get.status, 405);
    assert.equal(get.headers.allow, "POST");
    assert.match(get.text, /<form action="\/logout" method="post"/);
    assert.equal((await agent.get("/camps/new")).status, 200, "still logged in");

    const post = await agent.post("/logout");
    assert.equal(post.status, 302);
    assert.equal((await agent.get("/camps/new")).status, 302, "logged out");
  });

  test("after login you return to the page you asked for, once", async () => {
    const agent = h.agentFor(app);
    const { user } = await agent.signUp();
    await agent.logOut();
    await agent.get("/camps/new");
    const first = await agent.logIn(user.username, user.password);
    assert.equal(first.headers.location, "/camps/new");
    await agent.logOut();
    const second = await agent.logIn(user.username, user.password);
    assert.equal(second.headers.location, "/camps");
  });
});

describe("cross-site writes", () => {
  const login = () =>
    request(app).post("/login").type("form").send({ username: "nobody", password: "x" });

  test("a POST from another site is refused", async () => {
    const res = await login().set("Origin", "https://evil.example");
    assert.equal(res.status, 403);
    const fetchSite = await login().set("Sec-Fetch-Site", "cross-site");
    assert.equal(fetchSite.status, 403);
    const nullOrigin = await login().set("Origin", "null");
    assert.equal(nullOrigin.status, 403);
  });

  test("same-origin and header-less POSTs go through", async () => {
    const same = await login().set("Host", "camps.example").set("Origin", "http://camps.example");
    assert.equal(same.status, 302);
    const fetchSite = await login().set("Sec-Fetch-Site", "same-origin");
    assert.equal(fetchSite.status, 302);
    const proxied = await login()
      .set("X-Forwarded-Host", "nz-camps.vercel.app")
      .set("Origin", "https://nz-camps.vercel.app");
    assert.equal(proxied.status, 302);
    const bare = await login();
    assert.equal(bare.status, 302);
  });
});

describe("session secret", () => {
  const { sessionSecret, DEV_SECRET } = require("../utils/sessions");

  test("uses SECRET when it is set", () => {
    assert.equal(sessionSecret({ env: { SECRET: "s3", NODE_ENV: "production" } }), "s3");
  });

  test("in production without SECRET it logs, keeps working and stays stable", () => {
    const logged = [];
    const env = { NODE_ENV: "production", DB_URL: "mongodb://example.invalid/x" };
    const a = sessionSecret({ env, log: (m) => logged.push(m) });
    const b = sessionSecret({ env, log: () => {} });
    assert.equal(logged.length, 1);
    assert.match(logged[0], /SECRET is not set/);
    assert.ok(Array.isArray(a) && a.length === 2);
    assert.deepEqual(a, b, "the same on every instance");
    assert.equal(a[1], "badsecret", "older cookies still verify");
    assert.ok(!a[0].includes("example.invalid"), "the database URL is not the secret");
  });

  test("in development without SECRET it uses the named dev placeholder", () => {
    assert.equal(sessionSecret({ env: {} }), DEV_SECRET);
  });
});

test("with NODE_ENV=production and no SECRET the app starts, logs and serves", () => {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const script = `
    const request = require("supertest");
    const app = require(${JSON.stringify(path.join(root, "index"))});
    request(app).get("/camps").then((res) => {
      console.log("STATUS " + res.status);
      process.exit(0);
    });
  `;
  const run = spawnSync(
    process.execPath,
    ["-r", path.join(__dirname, "helpers", "guard.js"), "-e", script],
    {
      cwd: root,
      env: { PATH: process.env.PATH, NODE_ENV: "production" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /STATUS 200/);
  assert.match(run.stderr, /SECRET is not set/);
});

describe("passport 0.7", () => {
  test("the session id changes on login (no session fixation)", async () => {
    const agent = h.agentFor(app);
    const { user } = await agent.signUp();
    // Logging out leaves an anonymous session (it carries the flash message).
    const out = await agent.logOut();
    const before = cookies(out).find((c) => c.startsWith("connect.sid="));
    assert.ok(before, "a session existed before login");
    const ok = await agent.logIn(user.username, user.password);
    const after = cookies(ok).find((c) => c.startsWith("connect.sid="));
    assert.ok(after, "login sets a new cookie");
    assert.notEqual(after.split(";")[0], before.split(";")[0]);
  });

  test("logout redirects instead of failing", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const res = await agent.post("/logout");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/camps");
  });

  test("a session stored by the old passport version still signs you in", async () => {
    const signature = require("cookie-signature");
    const agent = h.agentFor(app);
    const { user } = await agent.signUp();
    const sid = `legacy-${Date.now()}`;
    await mongoose.connection.db.collection("sessions").insertOne({
      _id: sid,
      expires: new Date(Date.now() + 60 * 60 * 1000),
      session: JSON.stringify({
        cookie: { originalMaxAge: 604800000, httpOnly: true, sameSite: "lax", path: "/" },
        passport: { user: user.username },
      }),
    });
    const cookie = `connect.sid=${encodeURIComponent("s:" + signature.sign(sid, process.env.SECRET))}`;
    const res = await request(app).get("/camps/new").set("Cookie", cookie);
    assert.equal(res.status, 200, "signed in from the stored session");
  });
});
