// Design stage (D1 to D9): page structure, metadata, images, header and
// footer, and the markup the layout and accessibility work relies on.
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
  campId = h.campIdFrom(await agent.createCamp({ title: "Design Camp" }));
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

const tags = (html, re) => [...html.matchAll(re)].map((m) => m[0]);

// ---------- D5: images ----------

test("every file the image manifest names exists", h.notInBundle, () => {
  const manifest = require("../utils/images.json");
  const sets = [
    ...Object.values(manifest.photos),
    manifest.hero.portrait,
    manifest.hero.wide,
    manifest.backdrop.tall,
    manifest.auth,
  ];
  for (const set of sets) {
    for (const w of set.avif) {
      const f = path.join(h.ROOT, "public", `${set.name}-${w}.avif`);
      assert.ok(fs.existsSync(f), f);
    }
    for (const w of set.jpeg) {
      const f = path.join(h.ROOT, "public", `${set.name}-${w}.jpg`);
      assert.ok(fs.existsSync(f), f);
    }
  }
  assert.ok(fs.existsSync(path.join(h.ROOT, "public", manifest.og.url)));
});

test("every sample photo has responsive variants", () => {
  const manifest = require("../utils/images.json");
  for (const p of require("../utils/samplePhotos").PHOTOS) {
    assert.ok(manifest.photos[p.url], p.url);
  }
});

test("the original photo addresses the live database uses still load", h.notInBundle, async () => {
  for (const url of [
    "/stylesheets/anderson-aguirre-bjTQqa6o_cM-unsplash.jpg",
    "/stylesheets/casey-horner-_aVKjJhFdn0-unsplash.jpg",
    "/stylesheets/tyler-lastovich-MfRNe40ihls-unsplash.jpg",
  ]) {
    const res = await request(app).get(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers["content-type"], "image/jpeg", url);
  }
});

test("AVIF variants are served as image/avif", h.notInBundle, async () => {
  const res = await request(app).get("/images/mitchell-luo-1200.avif");
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "image/avif");
});

test("pages preload no photos they do not show", async () => {
  for (const p of ["/camps", `/camps/${campId}`, "/login", "/register", "/nope"]) {
    const res = await request(app).get(p);
    assert.deepEqual(tags(res.text, /<link rel="preload"[^>]*>/g), [], p);
  }
});

test("photo and backdrop originals stay out of page markup", async () => {
  for (const p of ["/", "/camps", `/camps/${campId}`, "/login"]) {
    const res = await request(app).get(p);
    assert.doesNotMatch(res.text, /mitchell-luo-CEowgw6VXbE|casey-horner-_aVKjJhFdn0/, p);
  }
});

// ---------- D1: structure and metadata ----------

const attr = (html, re) => (re.exec(html) || [])[1];
const title = (html) => attr(html, /<title>([^<]*)<\/title>/);

async function pages() {
  const agent = h.agentFor(app);
  const anon = {
    home: (await request(app).get("/")).text,
    camps: (await request(app).get("/camps")).text,
    search: (await request(app).get("/camps?q=design")).text,
    camp: (await request(app).get(`/camps/${campId}`)).text,
    login: (await request(app).get("/login")).text,
    register: (await request(app).get("/register")).text,
    logout: (await request(app).get("/logout")).text,
    missing: (await request(app).get("/nope")).text,
  };
  await agent.signUp();
  const own = h.campIdFrom(await agent.createCamp({ title: "Own Camp" }));
  anon.add = (await agent.get("/camps/new")).text;
  anon.edit = (await agent.get(`/camps/${own}/edit`)).text;
  return anon;
}

test("every page has its own title in the 'Page · NZ Camps' pattern", async () => {
  const all = await pages();
  const titles = Object.fromEntries(Object.entries(all).map(([k, html]) => [k, title(html)]));
  assert.equal(titles.camp, "Design Camp · NZ Camps");
  assert.equal(titles.login, "Log in · NZ Camps");
  assert.equal(titles.register, "Sign up · NZ Camps");
  assert.equal(titles.missing, "Page not found · NZ Camps");
  assert.equal(titles.camps, "Explore camps · NZ Camps");
  assert.equal(titles.search, "Camps matching “design” · NZ Camps");
  assert.equal(titles.add, "Add a camp · NZ Camps");
  assert.equal(titles.edit, "Edit Own Camp · NZ Camps");
  assert.match(titles.home, /^NZ Camps · /);
  assert.equal(new Set(Object.values(titles)).size, Object.keys(titles).length, "all unique");
  for (const [name, html] of Object.entries(all)) {
    assert.equal(tags(html, /<title>/g).length, 1, name);
    assert.ok((attr(html, /<meta name="description" content="([^"]+)"/) || "").length > 20, name);
  }
});

test("page 2 of the list says so in its title", async () => {
  const res = await request(app).get("/camps?page=2");
  assert.equal(title(res.text), "Explore camps, page 2 · NZ Camps");
});

test("camp titles are escaped in the head", async () => {
  const agent = h.agentFor(app);
  await agent.signUp();
  const id = h.campIdFrom(await agent.createCamp({ title: `Tui "&" <b>Bay</b>` }));
  const html = (await request(app).get(`/camps/${id}`)).text;
  assert.equal(title(html), "Tui &#34;&amp;&#34; &lt;b&gt;Bay&lt;/b&gt; · NZ Camps");
  assert.match(
    html,
    /<meta property="og:title" content="Tui &#34;&amp;&#34; &lt;b&gt;Bay&lt;\/b&gt;" \/>/,
  );
  assert.doesNotMatch(html.slice(0, html.indexOf("</head>")), /<b>/);
});

test("social cards: og and twitter tags with an absolute image URL", async () => {
  const res = await request(app).get(`/camps/${campId}`).set("Host", "camps.example");
  const html = res.text;
  assert.equal(
    attr(html, /<meta property="og:image" content="([^"]+)"/),
    "http://camps.example/images/og-nzcamps.jpg",
  );
  assert.equal(
    attr(html, /<meta property="og:url" content="([^"]+)"/),
    `http://camps.example/camps/${campId}`,
  );
  assert.equal(attr(html, /<meta property="og:title" content="([^"]+)"/), "Design Camp");
  assert.match(html, /<meta property="og:description" content="A test camp[^"]*"/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  process.env.BASE_URL = "https://nz-camps.vercel.app";
  try {
    const live = (await request(app).get("/login")).text;
    assert.equal(
      attr(live, /<meta property="og:image" content="([^"]+)"/),
      "https://nz-camps.vercel.app/images/og-nzcamps.jpg",
    );
  } finally {
    process.env.BASE_URL = "";
  }
});

test("landmarks, a skip link and one H1 with headings in order", async () => {
  for (const [name, html] of Object.entries(await pages())) {
    const body = html.slice(html.indexOf("<body"));
    assert.match(
      body,
      /^<body[^>]*>\s*<a class="skip-link" href="#main">Skip to content<\/a>/,
      name,
    );
    assert.equal(tags(html, /<header[\s>]/g).length, 1, `${name} header`);
    assert.equal(tags(html, /<main id="main"/g).length, 1, `${name} main`);
    assert.equal(tags(html, /<footer[\s>]/g).length, 1, `${name} footer`);
    const levels = tags(html, /<h[1-6][\s>]/g).map((t) => Number(t[2]));
    assert.equal(levels.filter((l) => l === 1).length, 1, `${name} has one h1`);
    assert.equal(levels[0], 1, `${name} starts with the h1`);
    levels.reduce((prev, l) => {
      assert.ok(l <= prev + 1, `${name}: h${prev} is followed by h${l}`);
      return l;
    });
    const ids = tags(html, /\sid="[^"]+"/g);
    assert.equal(new Set(ids).size, ids.length, `${name} has no duplicate ids`);
  }
});
