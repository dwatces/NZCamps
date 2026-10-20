/* One-shot seeder: copies the sample campgrounds into a database.
   Usage: DB_URL=<uri> [SEED_PASSWORD=<pw>] node seeds/seedAtlas.js
   A database that is not on this machine also needs CONFIRM_REMOTE=yes.
   Idempotent: skips camps whose title already exists. The camps keep their
   "Demo campground:" label and are flagged isDemo, so they show as samples. */
const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/user");
const Camp = require("../models/camp");
const demoCamps = require("./demoData");
const { SEED_USERNAME } = require("../utils/sample");
const { isLoopbackDbUrl, maskedHost, checkDbUrl } = require("./dbGuard");

async function main() {
  const dbUrl = checkDbUrl();
  await mongoose.connect(dbUrl);

  let author = await User.findOne({ username: SEED_USERNAME });
  let password = null;
  if (!author) {
    password = process.env.SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");
    author = await User.register(
      new User({ username: SEED_USERNAME, email: "ranger@camps.example" }),
      password,
    );
  }

  let created = 0;
  for (const d of demoCamps) {
    const existing = await Camp.findOne({ title: d.title });
    if (existing) continue;
    // The string demo ids (demo1...) are never written: _id is an ObjectId.
    await Camp.create({
      title: d.title,
      price: d.price,
      description: d.description,
      location: d.location,
      images: d.images.map((i) => ({ url: i.url, alt: i.alt })),
      geometry: d.geometry,
      isDemo: true,
      author: author._id,
      reviews: [],
    });
    created++;
  }

  const camps = await Camp.countDocuments();
  console.log(
    `Seed done on ${maskedHost(dbUrl)}: ${created} camps created. DB now has ${camps} camps.`,
  );
  if (password && !process.env.SEED_PASSWORD) {
    console.log(`Created user "${SEED_USERNAME}" with password: ${password}`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { isLoopbackDbUrl };
