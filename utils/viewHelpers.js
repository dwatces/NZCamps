// Helpers available in every template (app.locals). Templates receive three
// data shapes: Mongoose documents, .lean() objects and demo-mode objects, so
// none of these rely on Mongoose methods.

const { isSample } = require("./sample");
const { samplePhoto } = require("./samplePhotos");

// JSON for a <script type="application/json"> block. Escaping <, > and &
// means a "</script>" or "<!--" in user text cannot end the block early.
function safeJson(value) {
  return JSON.stringify(value === undefined ? null : value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const idOf = (x) => (x && typeof x === "object" && "_id" in x ? x._id : x);

// True when two ids (or documents with ids) are the same; false if either is missing.
function sameId(a, b) {
  const x = idOf(a);
  const y = idOf(b);
  if (x === null || x === undefined || y === null || y === undefined) return false;
  return String(x) === String(y);
}

// Older accounts could pick an email address as their username. It is never
// shown; new usernames cannot contain "@" (registerSchema).
const looksLikeEmail = (name) => name.includes("@");

// The name shown for an author. Authors can be missing (a deleted account).
function displayName(author) {
  if (!author || typeof author.username !== "string" || !author.username) return "Former member";
  if (looksLikeEmail(author.username)) return "NZ Camps member";
  return author.username;
}

// The minimum a map needs: no author, no reviews, no images, no description.
function mapPoint(camp) {
  const [lng, lat] = (camp && camp.geometry && camp.geometry.coordinates) || [];
  return {
    id: String(camp._id),
    title: camp.title,
    location: camp.location,
    price: camp.price,
    lng: Number(lng),
    lat: Number(lat),
    sample: isSample(camp),
  };
}

const mapPoints = (camps) => (camps || []).map(mapPoint);

// Alt text for a camp photo: its own description (sample photos have one),
// otherwise its place in the gallery. Uploads carry no description.
function photoAlt(img, camp, index = 0, total = 1) {
  const known = (img && img.alt) || (img && samplePhoto(img.url) && samplePhoto(img.url).alt);
  if (known) return known;
  const title = (camp && camp.title) || "this camp";
  return total > 1 ? `Photo ${index + 1} of ${total} of ${title}` : `Photo of ${title}`;
}

// { name, page } for a credited sample photo, or null.
function photoCredit(img) {
  const p = img && samplePhoto(img.url);
  return p ? { name: p.credit, page: p.page } : null;
}

module.exports = {
  safeJson,
  sameId,
  displayName,
  mapPoint,
  mapPoints,
  isSample,
  photoAlt,
  photoCredit,
};
