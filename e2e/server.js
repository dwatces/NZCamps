// The app as the end-to-end tests see it (Playwright starts this; see
// playwright.config.js).
//
//   node e2e/server.js                 in-memory MongoDB, port 7203
//   node e2e/server.js --demo          no database (demo mode), port 7206
//   node e2e/server.js --port 7204 --production
//                                      the database run in production mode,
//                                      for screenshots and timings
//
// The database run starts mongodb-memory-server on a port the OS picks, runs
// the real seeder (the eight labelled sample camps), and adds member camps:
// one with two photos and two reviews, one with no photos, one whose text is
// hostile, and two plain ones so the list has a second page. Geocoding is a
// stub that knows a few places by name. The network guard from the
// integration tests is installed first, so nothing here can reach the
// internet: no geocoder, no Cloudinary, no real database.
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const h = require("../test/helpers");
const { file } = require("../test/helpers/files");
const { PORTS, MEMBER, NO_PHOTO_TITLE, HOSTILE } = require("./constants");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const demo = args.includes("--demo");
const production = args.includes("--production");
const portArg = args.indexOf("--port");
const port = portArg >= 0 ? Number(args[portArg + 1]) : demo ? PORTS.demo : PORTS.db;
if (!(port >= 7201 && port <= 7209)) throw new Error("Use a port from 7201 to 7209");

const PLACES = {
  wellington: { lat: -41.2865, lng: 174.7762, name: "Wellington, New Zealand" },
  invercargill: { lat: -46.4132, lng: 168.3538, name: "Invercargill, Southland, New Zealand" },
  "lake tekapo": { lat: -44.0045, lng: 170.4777, name: "Lake Tekapo, Canterbury, New Zealand" },
  gisborne: { lat: -38.6623, lng: 178.0176, name: "Gisborne, New Zealand" },
  nelson: { lat: -41.2706, lng: 173.284, name: "Nelson, New Zealand" },
  dunedin: { lat: -45.8788, lng: 170.5028, name: "Dunedin, Otago, New Zealand" },
  kaitaia: { lat: -35.1149, lng: 173.2626, name: "Kaitāia, Northland, New Zealand" },
};
async function geocode(location) {
  const key = String(location).trim().toLowerCase();
  if (key.includes("nowhere")) return null;
  const known = Object.keys(PLACES).find((name) => key.startsWith(name));
  return PLACES[known] || PLACES.wellington;
}

const repoPhoto = (name) =>
  file(fs.readFileSync(path.join(ROOT, "public", "images", name)), name, "image/jpeg");

async function addCamp(owner, fields, photos = []) {
  const res = await owner.createCamp(fields, photos);
  const id = h.campIdFrom(res);
  if (!id) throw new Error(`Seeding "${fields.title}" failed (${res.status})`);
  return id;
}

async function review(app, campId, username, rating, body) {
  const reviewer = h.agentFor(app);
  await reviewer.signUp({ username, password: MEMBER.password });
  await reviewer
    .post(`/camps/${campId}/reviews`)
    .type("form")
    .send({ "review[rating]": rating, "review[body]": body });
}

async function seedMembers(app) {
  const owner = h.agentFor(app);
  await owner.signUp({ username: MEMBER.username, password: MEMBER.password });
  const memberId = await addCamp(
    owner,
    {
      title: MEMBER.campTitle,
      location: "Lake Tekapo",
      price: "18.50",
      description:
        "A test camp made by the end-to-end server, with two photos and two reviews. Flat grass beside the river, a long-drop toilet and room between sites.",
    },
    [repoPhoto("casey-horner-1200.jpg"), repoPhoto("hahei-kura-tregenza-800.jpg")],
  );
  await review(app, memberId, "tui_walker", "4", "Quiet and sheltered. The river was cold.");
  await review(app, memberId, "weka_watch", "5", "Great spot, would stay again.");

  await addCamp(owner, {
    title: NO_PHOTO_TITLE,
    location: "Dunedin",
    price: "0",
    description: "A test camp with no photos and no reviews, for the empty states.",
  });
  const hostileId = await addCamp(owner, {
    title: HOSTILE.title,
    location: HOSTILE.location,
    price: "12",
    description: HOSTILE.description,
  });
  await review(app, hostileId, "pukeko_pal", "3", HOSTILE.review);
  for (const [title, location] of [
    ["Matai Terrace", "Nelson"],
    ["Rimu Bend", "Kaitaia"],
  ]) {
    await addCamp(owner, {
      title,
      location,
      price: "15",
      description: "A plain test camp, so the list has more than one page.",
    });
  }
  return memberId;
}

async function main() {
  let db = null;
  let app;
  const env = production ? { NODE_ENV: "production" } : {};
  if (demo) {
    app = await h.makeApp({ env });
  } else {
    db = await h.startDb();
    const seed = spawnSync(process.execPath, [path.join(ROOT, "seeds", "seedAtlas.js")], {
      env: { PATH: process.env.PATH, DB_URL: db.uri, SEED_PASSWORD: "e2e-seed-password" },
      encoding: "utf8",
    });
    if (seed.status !== 0) throw new Error(`Seeder failed: ${seed.stderr}`);
    app = await h.makeApp({ dbUri: db.uri, env });
  }
  app.locals.geocode = geocode;
  const memberId = demo ? null : await seedMembers(app);

  const server = app.listen(port, "127.0.0.1", () => {
    const mode = demo ? "demo mode" : "in-memory MongoDB";
    console.log(
      `e2e server on http://127.0.0.1:${port} (${mode}, NODE_ENV=${process.env.NODE_ENV})`,
    );
    if (memberId) console.log(`member camp ${memberId}`);
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    await h.closeApp().catch(() => {});
    if (db) await db.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
