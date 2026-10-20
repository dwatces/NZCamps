// Helpers available in every template (app.locals). Templates receive three
// data shapes: Mongoose documents, .lean() objects and demo-mode objects, so
// none of these rely on Mongoose methods.

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

// The name shown for an author. Authors can be missing (a deleted account).
function displayName(author) {
  if (!author || typeof author.username !== "string" || !author.username) return "Former member";
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
  };
}

const mapPoints = (camps) => (camps || []).map(mapPoint);

module.exports = { safeJson, sameId, displayName, mapPoint, mapPoints };
