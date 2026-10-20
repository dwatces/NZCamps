/* Labels the sample camps already in a database.
   Usage: DB_URL=<uri> node seeds/labelDemo.js [--apply] [--photos]
   A database that is not on this machine also needs CONFIRM_REMOTE=yes.

   Without --apply it is a dry run: it only counts what would change.
   - Camps added by the seed account ("ranger") get isDemo: true. The site
     already shows them as samples (utils/sample.js); this makes the flag
     match, for queries and for any future change to that rule.
   - With --photos, sample camps whose title is in seeds/demoData.js and whose
     photos are all files from this repository also get the current sample
     photos and alt text (the older seed paired some camps with photos taken
     elsewhere). Uploaded photos are never touched.
   It prints counts and a masked host only. */
const mongoose = require("mongoose");
const User = require("../models/user");
const Camp = require("../models/camp");
const demoCamps = require("./demoData");
const { SEED_USERNAME } = require("../utils/sample");
const { maskedHost, checkDbUrl } = require("./dbGuard");

const isRepoFile = (url) => typeof url === "string" && /^\/(?!\/)/.test(url);

function photosNeedUpdate(camp, demo) {
  const current = camp.images || [];
  if (!current.every((img) => isRepoFile(img.url))) return false;
  if (current.length !== demo.images.length) return true;
  return demo.images.some((img, i) => current[i].url !== img.url || current[i].alt !== img.alt);
}

async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const photos = argv.includes("--photos");
  const dbUrl = checkDbUrl();
  await mongoose.connect(dbUrl);
  try {
    console.log(`Database: ${maskedHost(dbUrl)}`);
    const ranger = await User.findOne({ username: SEED_USERNAME }, "_id").lean();
    if (!ranger) {
      console.log(`No "${SEED_USERNAME}" account, so there are no sample camps to label.`);
      return;
    }

    const unlabelled = { author: ranger._id, isDemo: { $ne: true } };
    const toLabel = await Camp.countDocuments(unlabelled);
    if (apply && toLabel) await Camp.updateMany(unlabelled, { $set: { isDemo: true } });
    console.log(
      apply
        ? `Labelled ${toLabel} camps as samples.`
        : `${toLabel} camps by "${SEED_USERNAME}" are not labelled as samples yet.`,
    );

    if (photos) {
      const byTitle = new Map(demoCamps.map((d) => [d.title, d]));
      const camps = await Camp.find(
        { author: ranger._id, title: { $in: [...byTitle.keys()] } },
        "title images",
      ).lean();
      const stale = camps.filter((c) => photosNeedUpdate(c, byTitle.get(c.title)));
      if (apply) {
        for (const c of stale) {
          const images = byTitle.get(c.title).images.map(({ url, alt }) => ({ url, alt }));
          await Camp.updateOne({ _id: c._id }, { $set: { images } });
        }
      }
      console.log(
        apply
          ? `Updated the photos of ${stale.length} sample camps.`
          : `${stale.length} sample camps have older photos.`,
      );
    }

    if (!apply) console.log("Dry run: nothing was changed. Add --apply to make these changes.");
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { photosNeedUpdate };
