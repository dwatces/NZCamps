/* One-shot seeder: copies the demo campgrounds into the real database.
   Usage: DB_URL=<atlas-uri> [SEED_PASSWORD=<pw>] node seeds/seedAtlas.js
   Idempotent: skips camps whose title already exists. */
const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/user");
const Camp = require("../models/camp");
const demoCamps = require("./demoData");

async function main() {
  if (!process.env.DB_URL) throw new Error("DB_URL is required");
  await mongoose.connect(process.env.DB_URL);

  let author = await User.findOne({ username: "ranger" });
  let password = null;
  if (!author) {
    password = process.env.SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");
    author = await User.register(
      new User({ username: "ranger", email: "ranger@camps.example" }),
      password
    );
  }

  let created = 0;
  for (const d of demoCamps) {
    const existing = await Camp.findOne({ title: d.title });
    if (existing) continue;
    await Camp.create({
      title: d.title,
      price: d.price,
      description: d.description
        .replace(/^Demo campground: /, "")
        .replace(/^./, (c) => c.toUpperCase()),
      location: d.location,
      images: d.images.map((i) => ({ url: i.url })),
      geometry: d.geometry,
      author: author._id,
      reviews: [],
    });
    created++;
  }

  const camps = await Camp.countDocuments();
  console.log(`Seed done: ${created} camps created. DB now has ${camps} camps.`);
  if (password) console.log(`Created user "ranger" with password: ${password}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
