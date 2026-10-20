// X5 and X10: editing keeps the location and photos right, and saving says
// where the camp was placed.
const h = require("./helpers");
const f = require("./helpers/files");
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

let db;
let app;
let Camp;
let agent;
let calls;

const PLACES = {
  wellington: { lat: -41.2865, lng: 174.7762, name: "Wellington, Wellington, New Zealand" },
  invercargill: { lat: -46.4132, lng: 168.3538, name: "Invercargill, Southland, New Zealand" },
  "lake tekapo": { lat: -44.0045, lng: 170.4777 },
};

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
  Camp = require("../models/camp");
  app.locals.geocode = async (location) => {
    calls.push(location);
    return PLACES[String(location).trim().toLowerCase()] || null;
  };
  agent = h.agentFor(app);
  await agent.signUp();
});

beforeEach(() => {
  calls = [];
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

const update = (id, fields = {}, files = [], remove = []) => {
  const camp = {
    title: "Edit Camp",
    location: "Wellington",
    price: "18",
    description: "For the edit tests.",
    ...fields,
  };
  let req = agent.post(`/camps/${id}?_method=PUT`);
  for (const [k, v] of Object.entries(camp)) req = req.field(`camp[${k}]`, v);
  for (const r of remove) req = req.field("deleteImages[]", r);
  for (const file of files) req = req.attach("image", file.buffer, file.options);
  return req;
};
const flash = async (id) => (await agent.get(`/camps/${id}`)).text;
const png = (n) => f.file(f.PNG, `p${n}.png`, "image/png");

test("saving a new camp names the place it was put", async () => {
  const res = await agent.createCamp({ title: "Placed", location: "Invercargill" });
  const id = h.campIdFrom(res);
  assert.match(
    await flash(id),
    /Camp added\. We placed it at Invercargill, Southland, New Zealand\./,
  );
});

test("without a place name, the message gives the coordinates", async () => {
  const id = h.campIdFrom(await agent.createCamp({ title: "Coords", location: "Lake Tekapo" }));
  assert.match(await flash(id), /Camp added\. We placed it at -44\.0045, 170\.4777\./);
});

test("changing the location moves the pin and says where", async () => {
  const id = h.campIdFrom(await agent.createCamp({ title: "Mover", location: "Wellington" }));
  calls = [];
  const res = await update(id, { title: "Mover", location: "Invercargill" });
  assert.equal(res.status, 302);
  assert.deepEqual(calls, ["Invercargill"]);
  const camp = await Camp.findById(id).lean();
  assert.deepEqual(camp.geometry.coordinates, [168.3538, -46.4132]);
  assert.equal(camp.location, "Invercargill");
  assert.match(await flash(id), /Camp updated\. We placed it at Invercargill, Southland/);
});

test("an unchanged location makes no geocoder call", async () => {
  const id = h.campIdFrom(await agent.createCamp({ title: "Stayer", location: "Wellington" }));
  calls = [];
  const res = await update(id, { title: "Stayer renamed", location: " wellington " });
  assert.equal(res.status, 302);
  assert.deepEqual(calls, []);
  assert.match(await flash(id), /Camp updated\.\s*</);
  assert.equal((await Camp.findById(id).lean()).title, "Stayer renamed");
});

test("a place that can't be found keeps the old pin and returns 422", async () => {
  const id = h.campIdFrom(await agent.createCamp({ title: "Keeper", location: "Wellington" }));
  const res = await update(id, { title: "Keeper changed", location: "Atlantis" });
  assert.equal(res.status, 422);
  assert.match(res.text, /value="Atlantis"/);
  assert.match(res.text, /couldn&#39;t find that location/);
  const camp = await Camp.findById(id).lean();
  assert.deepEqual(camp.geometry.coordinates, [174.7762, -41.2865]);
  assert.equal(camp.title, "Keeper", "nothing saved");
});

test("removing one of two photos leaves the other", async () => {
  const id = h.campIdFrom(await agent.createCamp({ title: "Two Photos" }, [png(1), png(2)]));
  const [first, second] = (await Camp.findById(id).lean()).images;
  const res = await update(id, { title: "Two Photos" }, [], [String(first._id)]);
  assert.equal(res.status, 302);
  const left = (await Camp.findById(id).lean()).images;
  assert.deepEqual(
    left.map((i) => String(i._id)),
    [String(second._id)],
  );
});

test("each remove-photo checkbox has a name and a 44 px label", async () => {
  const id = h.campIdFrom(await agent.createCamp({ title: "Labelled" }, [png(1), png(2)]));
  const html = (await agent.get(`/camps/${id}/edit`)).text.replace(/\s+/g, " ");
  const labels = [...html.matchAll(/<label class="photo-remove__label">(.*?)<\/label>/g)].map(
    (m) => m[1],
  );
  assert.equal(labels.length, 2);
  labels.forEach((inner, i) => {
    assert.match(inner, /<input type="checkbox"[^>]*name="deleteImages\[\]"/);
    assert.match(inner, new RegExp(`Remove photo ${i + 1} of 2`));
    assert.match(inner, /<img [^>]*alt=""/);
  });
  assert.match(html, /<legend[^>]*>Remove photos<\/legend>/);
  assert.match(html, /this one has room for 4 more/);
});

test("a camp without photos has no remove section", async () => {
  const id = h.campIdFrom(await agent.createCamp({ title: "No Photos Here" }));
  const html = (await agent.get(`/camps/${id}/edit`)).text;
  assert.doesNotMatch(html, /Remove photos/);
});

test("a camp can have up to 6 photos, and the message says how many more fit", async () => {
  const id = h.campIdFrom(await agent.createCamp({ title: "Full Up" }, [png(1), png(2), png(3)]));
  assert.equal((await update(id, { title: "Full Up" }, [png(4), png(5)])).status, 302);
  const over = await update(id, { title: "Full Up" }, [png(6), png(7)]);
  assert.equal(over.status, 422);
  assert.match(over.text, /A camp can have up to 6 photos\. You can add 1 more\./);
  assert.equal((await Camp.findById(id).lean()).images.length, 5, "nothing added");
  assert.equal((await update(id, { title: "Full Up" }, [png(6)])).status, 302);
  const full = await update(id, { title: "Full Up" }, [png(7)]);
  assert.equal(full.status, 422);
  assert.match(full.text, /Remove one to add another\./);
  // Removing one makes room for one.
  const [gone] = (await Camp.findById(id).lean()).images;
  assert.equal((await update(id, { title: "Full Up" }, [png(8)], [String(gone._id)])).status, 302);
  assert.equal((await Camp.findById(id).lean()).images.length, 6);
});

test("help texts are tied to their fields, and the counter is a polite live region", async () => {
  const html = (await agent.get("/camps/new")).text.replace(/\s+/g, " ");
  assert.match(html, /<input[^>]*id="location"[^>]*aria-describedby="location-help"/);
  assert.match(
    html,
    /id="location-help">A town, lake or park, for example Lake Tekapo\. We add “New Zealand” for you\.</,
  );
  assert.match(html, /<input[^>]*id="image"[^>]*aria-describedby="image-help"/);
  assert.match(html, /id="image-help"> JPG, PNG or WebP, up to 3 photos at a time\./);
  assert.match(html, /<textarea[^>]*id="description"[^>]*data-counter="description-count"/);
  assert.match(html, /<span id="description-count" aria-hidden="true">/);
  assert.match(html, /<p class="visually-hidden" id="description-count-live" aria-live="polite">/);
});
