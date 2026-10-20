// Photo uploads. Files are held in memory, checked, and only stored once the
// whole form is valid: on Cloudinary when CLOUDINARY_NAME, CLOUDINARY_API_KEY
// and CLOUDINARY_SECRET are set, otherwise embedded in the camp document as
// data URIs (serverless-safe, no disk).
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { detectImageType } = require("../utils/imageType");
const { stripJpegMetadata } = require("../utils/jpegMetadata");

const configured = !!(
  process.env.CLOUDINARY_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_SECRET
);

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
  });
}

// Three photos of up to 1.4 MB stay under Vercel's 4.5 MB request body limit.
const MAX_PHOTOS = 3;
// Photos one camp can have in total (edits add to what it has).
const MAX_CAMP_PHOTOS = 6;
const MAX_PHOTO_BYTES = Math.floor(1.4 * 1024 * 1024);
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_RULES = "Photos must be JPG, PNG or WebP, up to 1.4 MB each, 3 at most.";
const STORE_FAILED_MSG = "We couldn't save your photos right now. Try again in a minute.";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_PHOTOS, fileSize: MAX_PHOTO_BYTES },
  fileFilter(req, file, cb) {
    if (ACCEPTED_TYPES.has(file.mimetype)) return cb(null, true);
    const err = new Error(PHOTO_RULES);
    err.code = "PHOTO_TYPE";
    cb(err);
  },
});

// Parses the multipart form. A photo that breaks the rules does not throw:
// it is recorded on req.photoErrors so the form can be shown again with
// everything else the user typed (the file input is the last field, so the
// text fields are already parsed when a file is refused).
function acceptPhotos(req, res, next) {
  upload.array("image")(req, res, (err) => {
    if (err && (err instanceof multer.MulterError || err.code === "PHOTO_TYPE")) {
      req.photoErrors = [PHOTO_RULES];
      req.files = [];
      return next();
    }
    if (err) return next(err);
    const files = req.files || [];
    if (files.some((f) => !detectImageType(f.buffer))) {
      req.photoErrors = [PHOTO_RULES];
      req.files = [];
    }
    next();
  });
}

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "NZCamps", allowed_formats: ["jpg", "jpeg", "png", "webp"] },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Empty Cloudinary response"));
        resolve({ url: result.secure_url, filename: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

// Stores one checked photo and returns the camp image shape { url, filename }.
// JPEG metadata (GPS position, camera, time) is removed first: a photo sent
// straight from a phone, without the browser-side resize, would carry it.
async function storeImage(file) {
  const type = detectImageType(file.buffer);
  if (!type) throw new Error("storeImage called with an unchecked file");
  const buffer = type === "image/jpeg" ? stripJpegMetadata(file.buffer) : file.buffer;
  if (configured) return uploadToCloudinary(buffer);
  return {
    url: `data:${type};base64,${buffer.toString("base64")}`,
    filename: `embedded-${crypto.randomUUID()}`,
  };
}

// Deletes a stored image; a no-op for embedded data URIs and seeded images.
async function destroyImage(filename) {
  if (configured && filename && !filename.startsWith("embedded-")) {
    await cloudinary.uploader.destroy(filename);
  }
}

module.exports = {
  cloudinary,
  acceptPhotos,
  storeImage,
  destroyImage,
  uploadToCloudinary,
  PHOTO_RULES,
  STORE_FAILED_MSG,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_CAMP_PHOTOS,
};
