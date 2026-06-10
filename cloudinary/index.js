const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

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

// Without Cloudinary credentials, fall back to memory storage: images are
// embedded as data-URIs in the camp document (serverless-safe, no disk).
const storage = configured
  ? new CloudinaryStorage({
      cloudinary,
      params: {
        folder: "NZCamps",
        allowedFormats: ["jpeg", "png", "jpg"],
      },
    })
  : multer.memoryStorage();

// Map an uploaded multer file to the Camp image shape for either storage.
// Embedded images get a unique filename so per-image edit/delete still works.
function fileToImage(file) {
  if (file.path) return { url: file.path, filename: file.filename };
  return {
    url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
    filename: `embedded-${require("crypto").randomUUID()}`,
  };
}

// Delete a stored image; no-op for embedded data-URIs.
async function destroyImage(filename) {
  if (configured && filename && !filename.startsWith("embedded-")) {
    await cloudinary.uploader.destroy(filename);
  }
}

module.exports = {
  cloudinary,
  storage,
  fileToImage,
  destroyImage,
};
