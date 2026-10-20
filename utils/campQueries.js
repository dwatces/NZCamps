// Read queries for the camp pages. They return plain objects (no Mongoose
// documents), and never load the bytes of photos stored in the camp
// document: those are served by their own route (controllers/images.js).
const mongoose = require("mongoose");
const Camp = require("../models/camp");

// Authors are populated with their username only: never email, hash or salt.
const AUTHOR = { path: "author", select: "username", options: { lean: true } };

const isDataUri = (field) => ({
  $regexMatch: { input: { $ifNull: [field, ""] }, regex: "^data:" },
});

// One image without its bytes: an embedded photo keeps its id and gets
// `embedded: true` and no url.
const imageWithoutBytes = (img) => ({
  _id: `${img}._id`,
  filename: `${img}.filename`,
  alt: `${img}.alt`,
  embedded: isDataUri(`${img}.url`),
  url: { $cond: [isDataUri(`${img}.url`), null, `${img}.url`] },
});

const IMAGES_WITHOUT_BYTES = {
  $map: { input: { $ifNull: ["$images", []] }, as: "img", in: imageWithoutBytes("$$img") },
};

// The camp page: the camp, its author and its reviews (newest first) with
// their authors. Null when there is no such camp.
async function findCampForShow(id) {
  const [camp] = await Camp.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(String(id)) } },
    {
      $project: {
        title: 1,
        location: 1,
        price: 1,
        description: 1,
        geometry: 1,
        isDemo: 1,
        author: 1,
        reviews: 1,
        createdAt: 1,
        images: IMAGES_WITHOUT_BYTES,
      },
    },
  ]);
  if (!camp) return null;
  await Camp.populate(camp, [
    AUTHOR,
    {
      path: "reviews",
      select: "body rating author createdAt",
      options: { lean: true },
      populate: AUTHOR,
    },
  ]);
  // A review id whose review no longer exists populates as null.
  camp.reviews = (camp.reviews || []).filter(Boolean).reverse();
  return camp;
}

module.exports = { AUTHOR, IMAGES_WITHOUT_BYTES, imageWithoutBytes, findCampForShow };
