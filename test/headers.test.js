// F6 with review B5/B6: security headers on every page.
const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

let db;
let app;
let campId;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  const agent = h.agentFor(app);
  await agent.signUp();
  campId = h.campIdFrom(await agent.createCamp({ title: "Header Camp" }));
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

function parseCsp(header) {
  const out = {};
  for (const part of header.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

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
  test(`${p} sends the CSP and the other security headers`, async () => {
    const res = await request(app).get(p.replace(":id", campId));
    const csp = parseCsp(res.headers["content-security-policy"] || "");
    for (const [name, values] of Object.entries(EXPECTED)) {
      assert.deepEqual(csp[name], values, name);
    }
    assert.equal(csp["upgrade-insecure-requests"], undefined, "no upgrade-insecure-requests");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
    assert.equal(res.headers["x-powered-by"], undefined);
  });
}

test(
  "templates and browser scripts use no CDN, inline handler or inline style",
  h.notInBundle,
  () => {
    const root = path.join(__dirname, "..");
    const walk = (d) =>
      fs
        .readdirSync(d, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of [...walk(path.join(root, "views")), ...walk(path.join(root, "public", "js"))]) {
      const src = fs.readFileSync(f, "utf8");
      assert.doesNotMatch(src, /unpkg|images\.unsplash|cdn\.jsdelivr|style="|onclick=/, f);
      if (f.endsWith(".ejs")) {
        assert.doesNotMatch(src, /<script>(?!<\/script>)|<script(?![^>]*\b(src|type)=)[^>]*>/, f);
      }
    }
  },
);

test("pages are valid single documents: one head, nav inside body", async () => {
  for (const p of ["/", "/camps", `/camps/${campId}`, "/login"]) {
    const res = await request(app).get(p);
    assert.equal((res.text.match(/<head>/g) || []).length, 1, `${p} has one <head>`);
    const body = res.text.slice(res.text.indexOf("<body"));
    assert.match(body, /<nav/, `${p} nav is inside body`);
    assert.equal((res.text.match(/<main/g) || []).length, 1, `${p} has one <main>`);
  }
});
