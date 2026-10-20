// Security regression tests. Each title starts with the id of the hole it
// guards, as found in the 2026 code review of the 2021 app:
//
//   P0-2  every author's and reviewer's email address was in the page source
//   P0-3  stored XSS: camp text reached map popups and inline <script> blocks
//   P0-5  editing your own camp could delete other people's photos
//   P1-1  sessions and auth: no Secure cookie, a session for every visitor,
//         GET logout, no session id change on login, open returnTo, no
//         cross-site write check
//   P1-2  no security headers (CSP, nosniff, framing, referrer policy)
//   P1-3  uploads trusted the browser's file type
//   P1-4  validation gaps, including query-operator shaped form bodies
//
// The browser half (hostile text stays inert on the list, the camp page and
// both map popups) is e2e/security.spec.js.
const h = require("./helpers");
const f = require("./helpers/files");
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");
const mongoose = require("mongoose");

let db;
let app;
let campId;
let user;
let Camp;
let User;

const HOSTILE_TITLE = "<img src=x onerror=window.__x=1>";
const HOSTILE_DESC = "</script><script>window.__y=1</script>";

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Camp = require("../models/camp");
  User = require("../models/user");
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
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

const cookies = (res) => res.headers["set-cookie"] || [];
const sessionCookie = (res) => cookies(res).find((c) => c.startsWith("connect.sid="));
const sessionCount = () => mongoose.connection.db.collection("sessions").countDocuments();

function jsonBlocks(html) {
  return [
    ...html.matchAll(/<script type="application\/json" id="[^"]+">([\s\S]*?)<\/script>/g),
  ].map((m) => m[1]);
}

describe("P0-2 personal data", () => {
  for (const page of ["/camps", "/camps/:id"]) {
    test(`P0-2 no email, hash, salt or __v in ${page} HTML`, async () => {
      const res = await h.agentFor(app).get(page.replace(":id", campId));
      assert.equal(res.status, 200);
      for (const needle of ['"email"', user.email, '"hash"', '"salt"', '"__v"', "JSON.stringify"]) {
        assert.ok(!res.text.includes(needle), `${page} must not contain ${needle}`);
      }
    });
  }

  test("P0-2 an email-shaped username shows as NZ Camps member and is never printed", async () => {
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

  test("P0-2 a review whose author was deleted still renders, as Former member", async () => {
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
});

describe("P0-3 stored XSS", () => {
  for (const page of ["/camps", "/camps/:id"]) {
    test(`P0-3 hostile camp and review text is inert in ${page} HTML`, async () => {
      const res = await h.agentFor(app).get(page.replace(":id", campId));
      const blocks = jsonBlocks(res.text);
      assert.equal(blocks.length, 1, "one JSON data block");
      assert.ok(!/[<>&]/.test(blocks[0]), "no raw <, > or & inside the data block");
      const data = JSON.parse(blocks[0]);
      const camp = Array.isArray(data) ? data.find((c) => c.id === campId) : data;
      assert.equal(camp.title, HOSTILE_TITLE, "the text survives as data");
      assert.deepEqual(Object.keys(camp).sort(), [
        "id",
        "lat",
        "lng",
        "location",
        "price",
        "sample",
        "title",
      ]);
      assert.ok(!res.text.includes("<script>window.__y=1"), "no script breakout");
      assert.ok(!res.text.includes("<img src=x onerror"), "the title is escaped in HTML");
      assert.ok(!res.text.includes("<b>bold</b>"), "review text is escaped");
    });
  }

  test("P0-3 safeJson escapes <, >, & and the U+2028 and U+2029 line breaks", () => {
    const { safeJson } = require("../utils/viewHelpers");
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);
    const text = "</script><!--&" + LS + PS;
    const out = safeJson({ s: text });
    for (const ch of ["<", ">", "&", LS, PS]) assert.ok(!out.includes(ch), `escaped ${ch}`);
    assert.deepEqual(JSON.parse(out), { s: text });
  });

  test("P0-3 no template serialises data with <%- JSON", h.notInBundle, () => {
    const views = path.join(__dirname, "..", "views");
    const walk = (d) =>
      fs
        .readdirSync(d, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const file of walk(views)) {
      assert.doesNotMatch(fs.readFileSync(file, "utf8"), /<%-\s*JSON/, file);
    }
  });

  test("P0-3 map popups are built with textContent, never innerHTML", h.notInBundle, () => {
    for (const name of ["campMap.js", "clusterMap.js"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", "public", "js", name), "utf8");
      assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML/, name);
      assert.match(src, /textContent/, name);
    }
  });

  test("P0-3 imageUrl only rewrites Cloudinary URLs and never inlines a data URI", () => {
    const { imageUrl } = require("../utils/viewHelpers");
    const camp = { _id: "6650f0c2a1b2c3d4e5f60718" };
    assert.equal(
      imageUrl(camp, { url: "http://res.cloudinary.com/demo/image/upload/v1/NZCamps/a.jpg" }, 400),
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400/v1/NZCamps/a.jpg",
    );
    assert.equal(
      imageUrl(camp, {
        _id: "6650f0c2a1b2c3d4e5f60719",
        url: "data:image/png;base64,AAAA/upload/",
      }),
      "/camps/6650f0c2a1b2c3d4e5f60718/images/6650f0c2a1b2c3d4e5f60719",
    );
    assert.equal(
      imageUrl(camp, { _id: "6650f0c2a1b2c3d4e5f60719", embedded: true, url: null }),
      "/camps/6650f0c2a1b2c3d4e5f60718/images/6650f0c2a1b2c3d4e5f60719",
    );
    assert.equal(imageUrl(camp, { url: "/stylesheets/x.jpg" }), "/stylesheets/x.jpg");
    assert.equal(imageUrl(camp, null), "/images/no-photo.svg");
    assert.equal(
      imageUrl(camp, { url: "https://res.cloudinary.com.evil.example/image/upload/a.jpg" }),
      "https://res.cloudinary.com.evil.example/image/upload/a.jpg",
      "only the real host is rewritten",
    );
  });
});

describe("P0-5 photo ownership", () => {
  test("P0-5 another camp's image id in deleteImages is ignored; your own is removed", async () => {
    const bob = h.agentFor(app);
    await bob.signUp();
    const bobCamp = h.campIdFrom(
      await bob.createCamp({ title: "Bob Camp" }, [f.file(f.PNG, "b.png", "image/png")]),
    );
    const bobImageId = String((await Camp.findById(bobCamp).lean()).images[0]._id);

    const alice = h.agentFor(app);
    await alice.signUp();
    const aliceCamp = h.campIdFrom(
      await alice.createCamp({ title: "Alice Camp" }, [f.file(f.PNG, "a.png", "image/png")]),
    );
    const aliceImageId = String((await Camp.findById(aliceCamp).lean()).images[0]._id);

    const res = await alice
      .post(`/camps/${aliceCamp}?_method=PUT`)
      .field("camp[title]", "Alice Camp")
      .field("camp[location]", "Wellington")
      .field("camp[price]", "10")
      .field("camp[description]", "Edited.")
      .field("deleteImages[]", bobImageId)
      .field("deleteImages[]", aliceImageId);
    assert.equal(res.status, 302);
    assert.equal((await Camp.findById(bobCamp).lean()).images.length, 1, "Bob's image stays");
    assert.equal((await Camp.findById(aliceCamp).lean()).images.length, 0, "Alice's is gone");
  });
});

describe("P1-1 sessions and auth", () => {
  test("P1-1 anonymous GETs create no session and set no cookie", async () => {
    const beforeCount = await sessionCount();
    for (let i = 0; i < 5; i++) {
      for (const p of ["/", "/camps", `/camps/${campId}`, "/login"]) {
        const res = await request(app).get(p);
        assert.equal(res.status, 200);
        assert.deepEqual(cookies(res), [], `${p} sets no cookie`);
      }
    }
    assert.equal(await sessionCount(), beforeCount);
  });

  test("P1-1 the session cookie is HttpOnly and SameSite=Lax, and Secure over forwarded HTTPS", async () => {
    const agent = h.agentFor(app);
    const { user: member } = await agent.signUp();
    await agent.logOut();

    const https = await request(app)
      .post("/login")
      .set("X-Forwarded-Proto", "https")
      .type("form")
      .send({ username: member.username, password: member.password });
    const httpsCookie = sessionCookie(https);
    assert.ok(httpsCookie, "cookie set over HTTPS");
    assert.match(httpsCookie, /; Secure/);
    assert.match(httpsCookie, /; HttpOnly/);
    assert.match(httpsCookie, /; SameSite=Lax/);

    // Local development over plain HTTP still logs in.
    const plain = await request(app)
      .post("/login")
      .type("form")
      .send({ username: member.username, password: member.password });
    const plainCookie = sessionCookie(plain);
    assert.ok(plainCookie, "cookie set over HTTP");
    assert.doesNotMatch(plainCookie, /; Secure/);
    assert.match(plainCookie, /; HttpOnly/);
    assert.equal(plain.headers.location, "/camps");
  });

  test("P1-1 the session id changes on login (no session fixation)", async () => {
    const agent = h.agentFor(app);
    const { user: member } = await agent.signUp();
    // Logging out leaves an anonymous session (it carries the flash message).
    const before = sessionCookie(await agent.logOut());
    assert.ok(before, "a session existed before login");
    const after = sessionCookie(await agent.logIn(member.username, member.password));
    assert.ok(after, "login sets a new cookie");
    assert.notEqual(after.split(";")[0], before.split(";")[0]);
  });

  test("P1-1 GET /logout is ignored; only POST /logout logs out", async () => {
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

  test("P1-1 returnTo cannot send anyone to another site", async () => {
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
      const { user: member } = await agent.signUp();
      await agent.logOut();
      const res = await agent
        .post("/login")
        .type("form")
        .send({ username: member.username, password: member.password, returnTo: bad });
      assert.equal(res.headers.location, "/camps", bad);
      const signUp = await h
        .agentFor(app)
        .post("/register")
        .type("form")
        .send({
          username: `rt_${h.uniq()}`,
          email: `rt_${h.uniq()}@example.test`,
          password: "correct-horse-battery",
          returnTo: bad,
        });
      assert.equal(signUp.headers.location, "/camps", `sign up with ${bad}`);
    }
  });

  describe("P1-1 cross-site writes", () => {
    const login = () =>
      request(app).post("/login").type("form").send({ username: "nobody", password: "x" });

    test("P1-1 a POST from another site is refused with a 403 page", async () => {
      const res = await login().set("Origin", "https://evil.example");
      assert.equal(res.status, 403);
      assert.match(res.text, /This form was sent from another website/);
      const fetchSite = await login().set("Sec-Fetch-Site", "cross-site");
      assert.equal(fetchSite.status, 403);
      const nullOrigin = await login().set("Origin", "null");
      assert.equal(nullOrigin.status, 403);
      const lookalike = await login()
        .set("Host", "nz-camps.vercel.app")
        .set("Origin", "https://nz-camps.vercel.app.evil.example");
      assert.equal(lookalike.status, 403);
    });

    test("P1-1 same-origin and header-less POSTs go through", async () => {
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
});

describe("P1-2 security headers", () => {
  function parseCsp(header) {
    const out = {};
    for (const part of header.split(";")) {
      const [name, ...values] = part.trim().split(/\s+/);
      if (name) out[name] = values;
    }
    return out;
  }

  // Each directive is checked on its own (helmet adds defaults of its own, so
  // the whole string is never compared).
  const EXPECTED = {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://res.cloudinary.com",
      "https://*.tile.openstreetmap.org",
    ],
    "connect-src": ["'self'"],
    "font-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "script-src-attr": ["'none'"],
  };

  for (const p of ["/", "/camps", "/camps/:id", "/login", "/register", "/nope"]) {
    test(`P1-2 ${p} sends the CSP, nosniff, DENY framing and a referrer policy that keeps map tiles working`, async () => {
      const res = await request(app).get(p.replace(":id", campId));
      const csp = parseCsp(res.headers["content-security-policy"] || "");
      for (const [name, values] of Object.entries(EXPECTED)) {
        assert.deepEqual(csp[name], values, name);
      }
      assert.equal(csp["upgrade-insecure-requests"], undefined, "no upgrade-insecure-requests");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      // The old framing header agrees with frame-ancestors 'none'.
      assert.equal(res.headers["x-frame-options"], "DENY");
      // OpenStreetMap refuses tile requests without a Referer (helmet's default is no-referrer).
      assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
      assert.equal(res.headers["x-powered-by"], undefined, "no X-Powered-By");
    });
  }

  test("P1-2 the embedded photo route sends nosniff and no X-Powered-By", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const id = h.campIdFrom(
      await agent.createCamp({ title: "Header Photo" }, [f.file(f.PNG, "p.png", "image/png")]),
    );
    const imageId = String((await Camp.findById(id).lean()).images[0]._id);
    const res = await request(app).get(`/camps/${id}/images/${imageId}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "image/png");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-powered-by"], undefined);
  });
});

describe("P1-3 uploads", () => {
  test("P1-3 an HTML file declared as image/png is refused by its bytes and nothing is stored", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const res = await agent.createCamp({ title: "Evil Upload" }, [
      f.file(f.HTML, "evil.html", "image/png"),
    ]);
    assert.equal(res.status, 422);
    assert.match(res.text, /Photos must be JPG, PNG or WebP/);
    assert.equal(await Camp.countDocuments({ title: "Evil Upload" }), 0);
  });

  test("P1-3 the stored type comes from the file's bytes, not the browser's label", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    const id = h.campIdFrom(
      await agent.createCamp({ title: "Relabelled" }, [f.file(f.PNG, "photo.jpg", "image/jpeg")]),
    );
    assert.ok(id);
    const [image] = (await Camp.findById(id).lean()).images;
    assert.match(image.url, /^data:image\/png;base64,/);
  });
});

describe("P1-4 operator-shaped bodies", () => {
  test("P1-4 a {$gt: ''} log in body does not sign anyone in", async () => {
    const agent = h.agentFor(app);
    await agent.signUp();
    await agent.logOut();
    const res = await request(app)
      .post("/login")
      .type("form")
      .send("username[$gt]=&password[$gt]=");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/login");
    // The app parses only form bodies; a JSON body carries no credentials.
    const json = await request(app)
      .post("/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ username: { $gt: "" }, password: { $gt: "" } }));
    assert.equal(json.status, 302);
    assert.equal(json.headers.location, "/login");
    assert.equal((await request(app).get("/camps")).status, 200, "still serving");
  });

  test("P1-4 operator-shaped sign up fields are refused with 422 and nothing is stored", async () => {
    const before = await User.countDocuments();
    const res = await request(app)
      .post("/register")
      .type("form")
      .send("username[$ne]=x&email[$ne]=x&password=correct-horse-battery");
    assert.equal(res.status, 422);
    assert.equal(await User.countDocuments(), before);
  });

  test("P1-4 operator-shaped camp search text is ignored, not run as a query", async () => {
    const res = await request(app).get("/camps?q[$regex]=.*&sort[$gt]=");
    assert.equal(res.status, 200);
    assert.match(res.text, /Explore camps/);
  });
});
