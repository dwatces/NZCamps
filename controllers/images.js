// Serves a photo that is stored inside its camp document (a data URI, used
// when Cloudinary is not configured) as an ordinary image file, so pages
// link to it instead of carrying megabytes of base64. Image ids are never
// reused, so the response can be cached for good.
const mongoose = require("mongoose");
const Camp = require("../models/camp");
const ExpressError = require("../utils/expressError");

const DATA_URI = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

module.exports.serveImage = async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    res.set("Cache-Control", "no-store");
    throw new ExpressError("Photos can't be loaded right now", 503);
  }
  const { id, imageId } = req.params;
  // Loads only the one image, not the camp's other photos.
  const camp = await Camp.findOne({ _id: id, "images._id": imageId }, { "images.$": 1 }).lean();
  const image = camp && camp.images && camp.images[0];
  const match = image && DATA_URI.exec(image.url || "");
  if (!match) throw new ExpressError("Page not found", 404);
  const bytes = Buffer.from(match[2], "base64");
  res.set({
    "Content-Type": match[1],
    "Content-Length": String(bytes.length),
    "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
  });
  res.end(req.method === "HEAD" ? undefined : bytes);
};
