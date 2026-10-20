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

// ---------- D3: header, menu and footer ----------

const header = (html) => html.slice(html.indexOf("<header"), html.indexOf("</header>"));

test("the header has the wordmark, the menu button and one current link", async () => {
  const expected = {
    "/": "NZ Camps",
    "/camps": "Camps",
    "/login": "Log in",
    "/register": "Sign up",
    [`/camps/${campId}`]: "Camps",
  };
  for (const [p, label] of Object.entries(expected)) {
    const head = header((await request(app).get(p)).text);
    assert.match(head, /<a class="navbar-brand site-brand" href="\/"/, p);
    assert.match(head, /<svg class="site-brand__mark"[^>]*aria-hidden="true"/, p);
    assert.match(head, /navbar-expand-md/, p);
    assert.match(head, /aria-controls="site-menu"\s+aria-expanded="false"/, p);
    const current = tags(
      head,
      /aria-current="[^"]+"[^<]*?>(?:\s*<svg[\s\S]*?<\/svg>\s*<span>)?[^<]*/g,
    );
    assert.equal(current.length, 1, `${p} marks one link`);
    assert.ok(current[0].endsWith(label), `${p} marks ${label}`);
  }
  for (const p of ["/nope", "/credits"]) {
    assert.doesNotMatch(header((await request(app).get(p)).text), /aria-current/, p);
  }
});

test("signed in, the header offers Add a camp and a Log out button", async () => {
  const agent = h.agentFor(app);
  await agent.signUp();
  const head = header((await agent.get("/camps/new")).text);
  assert.match(head, /href="\/camps\/new" aria-current="page">Add a camp</);
  assert.match(head, /<form action="\/logout" method="post"[^>]*>\s*<button type="submit"/);
  assert.doesNotMatch(head, /href="\/login"/);
});

test("the footer is on every page with its credits and links", async () => {
  for (const p of ["/", "/camps", `/camps/${campId}`, "/login", "/nope", "/credits"]) {
    const html = (await request(app).get(p)).text;
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    assert.match(
      footer,
      /A portfolio project by <a href="https:\/\/danielolliver\.com\/dev\/">Daniel Olliver<\/a>/,
      p,
    );
    assert.match(
      footer,
      /<a href="https:\/\/github\.com\/dwatces\/NZCamps">Code on GitHub<\/a>/,
      p,
    );
    assert.match(footer, /Listings marked Sample are invented examples/, p);
    assert.match(footer, /OpenStreetMap<\/a> contributors/, p);
    assert.match(footer, /<a href="\/credits">Photo credits<\/a>/, p);
  }
});

test("the credits page names every photographer and links each photo", async () => {
  const res = await request(app).get("/credits");
  assert.equal(res.status, 200);
  assert.match(res.text, /<h1[^>]*>Photo credits<\/h1>/);
  for (const c of require("../utils/credits")) {
    assert.ok(res.text.includes(`<a href="${c.page}">${c.credit}</a>`), c.credit);
  }
  assert.match(res.text, /the sample listing Milford Sound Basecamp/);
});

// ---------- D4: home hero ----------

test("home keeps its identity: the path photo, the title and View Camps", async () => {
  const html = (await request(app).get("/")).text;
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)[1].replace(/<[^>]+>/g, "");
  assert.equal(h1, "New Zealand Camps");
  assert.match(
    html,
    /<a href="\/camps" class="btn btn-primary btn-lg home__button">View Camps<\/a>/,
  );
  assert.match(html, /<a class="home__link" href="\/register">Sign up to add a camp<\/a>/);
  assert.match(html, /Find and review campgrounds around Aotearoa\./);
});

test("the home photo is a responsive picture, fetched first, never preloaded", async () => {
  const html = (await request(app).get("/")).text;
  const picture = /<picture class="home__photo">([\s\S]*?)<\/picture>/.exec(html)[1];
  assert.match(
    picture,
    /media="\(orientation: portrait\)" type="image\/avif" srcset="\/images\/home-hero-480\.avif 480w/,
  );
  assert.match(
    picture,
    /type="image\/avif" srcset="\/images\/home-hero-wide-1200\.avif 1200w, \/images\/home-hero-wide-1920\.avif 1920w"/,
  );
  assert.match(picture, /<img[^>]*fetchpriority="high"/);
  assert.match(picture, /<img[^>]*width="1920"[^>]*height="1200"/);
  assert.doesNotMatch(html, /rel="preload"/);
  assert.doesNotMatch(html, /robert-koorenny/);
});

// ---------- D6: camps list ----------

async function campWithSamplePhoto(title) {
  const Camp = require("../models/camp");
  const agent = h.agentFor(app);
  await agent.signUp();
  const id = h.campIdFrom(await agent.createCamp({ title }));
  await Camp.updateOne(
    { _id: id },
    { $push: { images: { url: "/stylesheets/anderson-aguirre-bjTQqa6o_cM-unsplash.jpg" } } },
  );
  return { id, agent };
}

test("the list sits beside a map panel, with a List | Map toggle for small screens", async () => {
  const html = (await request(app).get("/camps")).text;
  assert.match(html, /<div class="camps-layout__list" id="camp-list-panel">/);
  assert.match(html, /<div class="camps-layout__map" id="camp-map-panel" hidden>/);
  assert.match(
    html,
    /<div id="cluster-map" class="camp-map" role="region" aria-label="Map of the camps in this list">/,
  );
  assert.match(
    html,
    /<div class="view-toggle is-pending" role="group" aria-label="Show camps as">/,
  );
  assert.match(html, /data-view="list" aria-pressed="true" aria-controls="camp-list-panel">List</);
  assert.match(html, /data-view="map" aria-pressed="false" aria-controls="camp-map-panel">Map</);
});

test("cards: the title is the link, photos are small responsive AVIF with a size", async () => {
  const { id } = await campWithSamplePhoto("Card Photo Camp");
  const html = (await request(app).get("/camps?q=card+photo")).text;
  const card = /<li class="camp-card">([\s\S]*?)<\/li>/.exec(html)[1];
  assert.match(
    card,
    new RegExp(
      `<h2 class="camp-card__heading"><a class="camp-card__title" href="/camps/${id}">Card Photo Camp</a></h2>`,
    ),
  );
  assert.match(
    card,
    /<source type="image\/avif" srcset="\/images\/anderson-aguirre-480\.avif 480w, \/images\/anderson-aguirre-800\.avif 800w"/,
  );
  assert.match(
    card,
    /<img class="camp-card__img" src="\/images\/anderson-aguirre-800\.jpg"[^>]*width="800" height="600"[^>]*loading="lazy"/,
  );
  assert.doesNotMatch(card, /1200|1920|\/stylesheets\//, "no large or original files on a card");
  assert.match(card, /View camp<span class="visually-hidden">: Card Photo Camp<\/span>/);
});

test("signed out: one Sign up button and a log in link; signed in: no duplicate add button", async () => {
  const out = (await request(app).get("/camps")).text;
  assert.match(
    out,
    /<p class="list-head__join">\s*<a class="btn btn-primary btn-sm" href="\/register">Sign up<\/a>\s*<span>or <a href="\/login">log in<\/a>/,
  );
  const agent = h.agentFor(app);
  await agent.signUp();
  const main = (await agent.get("/camps")).text.split('<main id="main"')[1];
  assert.doesNotMatch(main, /href="\/camps\/new"/, "Add a camp is in the header only");
  assert.doesNotMatch(main, /list-head__join/);
});
