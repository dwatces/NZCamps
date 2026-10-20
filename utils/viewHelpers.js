// Helpers available in every template (app.locals). Templates receive three
// data shapes: Mongoose documents, plain objects from queries (.lean() and
// aggregation rows) and demo-mode objects with string ids, so none of these
// rely on Mongoose methods or virtuals.

const { isSample } = require("./sample");
const { samplePhoto } = require("./samplePhotos");
// Responsive variants made by scripts/images.js. Loaded with require so the
// Vercel function bundle traces it.
const IMAGES = require("./images.json");

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

// Where a page loads a camp photo from, at about `width` pixels wide:
// - photos stored in the camp document (data URIs) come from their own route,
//   so the page never carries the bytes;
// - Cloudinary photos get an automatic format, quality and width;
// - the sample photos in public/ are used as they are;
// - no photo at all gives the "No photo yet" placeholder.
const PLACEHOLDER = "/images/no-photo.svg";
const CLOUDINARY_UPLOAD = /^https?:(\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

function isEmbedded(img) {
  return img.embedded === true || (typeof img.url === "string" && img.url.startsWith("data:"));
}

function imageUrl(camp, img, width = 800) {
  if (!img) return PLACEHOLDER;
  if (isEmbedded(img)) return `/camps/${camp._id}/images/${img._id}`;
  const url = typeof img.url === "string" ? img.url : "";
  const cloud = CLOUDINARY_UPLOAD.exec(url);
  if (cloud) return `https:${cloud[1]}f_auto,q_auto,w_${Math.round(width)}/${cloud[2]}`;
  return url || PLACEHOLDER;
}

// srcset strings for one variant set from utils/images.json, limited to
// widths up to maxWidth (cards never need more than 800 px).
function variantSources(set, maxWidth = Infinity) {
  const pick = (widths) => {
    const fit = widths.filter((w) => w <= maxWidth);
    return fit.length ? fit : widths.slice(0, 1);
  };
  const srcset = (widths, ext) => widths.map((w) => `${set.name}-${w}.${ext} ${w}w`).join(", ");
  const avif = pick(set.avif);
  const jpeg = pick(set.jpeg);
  return {
    avif: srcset(avif, "avif"),
    jpeg: srcset(jpeg, "jpg"),
    src: `${set.name}-${jpeg[jpeg.length - 1]}.jpg`,
    width: set.width,
    height: set.height,
  };
}

// How a template shows a camp photo at several widths:
// - repo photos with variants: { avif, jpeg, src } for a <picture>;
// - Cloudinary uploads: { srcset, src } with Cloudinary resizing each width;
// - embedded uploads and anything else: { src } only.
// `widths` are the widths the slot can use, largest last.
function responsivePhoto(camp, img, widths = [480, 800, 1200]) {
  const largest = widths[widths.length - 1];
  const set = img && typeof img.url === "string" && IMAGES.photos[img.url];
  if (set) return variantSources(set, largest);
  const src = imageUrl(camp, img, largest);
  if (CLOUDINARY_UPLOAD.test((img && img.url) || "")) {
    return { src, srcset: widths.map((w) => `${imageUrl(camp, img, w)} ${w}w`).join(", ") };
  }
  return { src };
}

// Variant sets that are not camp photos: the home hero and the log in card.
const imageSet = (name) => {
  const [group, key] = name.split(".");
  return variantSources(key ? IMAGES[group][key] : IMAGES[group]);
};

// { name, page } for a credited sample photo, or null.
function photoCredit(img) {
  const p = img && samplePhoto(img.url);
  return p ? { name: p.credit, page: p.page } : null;
}

// Prices: "Free", "$18 a night", "$18.50 a night".
const WHOLE_DOLLARS = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const WITH_CENTS = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function formatPrice(price) {
  const n = Number(price);
  if (price === null || price === undefined || price === "" || !Number.isFinite(n)) return "";
  if (n === 0) return "Free";
  return `${(Number.isInteger(n) ? WHOLE_DOLLARS : WITH_CENTS).format(n)} a night`;
}

// { avg, count } for a camp: from the list query's ratingAvg and reviewCount,
// or from its populated reviews on the camp page.
function ratingSummary(camp) {
  if (camp && typeof camp.reviewCount === "number") {
    const count = camp.reviewCount;
    return { count, avg: count && Number.isFinite(camp.ratingAvg) ? camp.ratingAvg : null };
  }
  const ratings = ((camp && camp.reviews) || [])
    .map((r) => r && r.rating)
    .filter((r) => Number.isFinite(r));
  if (!ratings.length) return { count: 0, avg: null };
  return { count: ratings.length, avg: ratings.reduce((a, b) => a + b, 0) / ratings.length };
}

const formatRating = (avg) => (Math.round(avg * 10) / 10).toFixed(1);
const reviewCountText = (n) => `${n} review${n === 1 ? "" : "s"}`;
const ratingText = ({ avg, count }) =>
  count ? `Rated ${formatRating(avg)} out of 5 from ${reviewCountText(count)}` : "No reviews yet";

// When a camp or review was added: createdAt, or for documents saved before
// timestamps were turned on, the time in their ObjectId. Demo objects have
// string ids and a createdAt.
function createdDate(doc) {
  if (!doc) return null;
  if (doc.createdAt) {
    const d = new Date(doc.createdAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (doc._id && typeof doc._id.getTimestamp === "function") return doc._id.getTimestamp();
  return null;
}

const NZ_DATE = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Pacific/Auckland",
});
const ISO_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" });
const formatDate = (d) => (d ? NZ_DATE.format(d) : ""); // "12 October 2026"
const isoDate = (d) => (d ? ISO_DATE.format(d) : ""); // "2026-10-12", for <time datetime>

// The start of a long text, cut at a word, for cards.
function excerpt(text, max = 140) {
  const chars = Array.from(
    String(text || "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (chars.length <= max) return chars.join("");
  const cut = chars.slice(0, max + 1).join("");
  const space = cut.lastIndexOf(" ");
  const head = space > max * 0.6 ? cut.slice(0, space) : chars.slice(0, max).join("");
  return `${head.replace(/[\s,.;:\u2013-]+$/, "")}\u2026`;
}

// aria-describedby and aria-invalid for a form field: the ids of its help
// texts and, when it has an error, of its error message. Ids come from the
// templates, never from user input.
const ID = /^[a-z][\w-]*$/i;
function fieldAria(name, fieldErrors, ...helpIds) {
  const ids = helpIds.filter(Boolean);
  if (![name, ...ids].every((id) => ID.test(id))) throw new Error("fieldAria: bad id");
  const invalid = Boolean(fieldErrors && fieldErrors[name]);
  if (invalid) ids.push(`${name}-error`);
  return (
    (ids.length ? ` aria-describedby="${ids.join(" ")}"` : "") +
    (invalid ? ' aria-invalid="true"' : "")
  );
}
const invalidClass = (name, fieldErrors) => (fieldErrors && fieldErrors[name] ? " is-invalid" : "");

module.exports = {
  safeJson,
  sameId,
  displayName,
  mapPoint,
  mapPoints,
  isSample,
  photoAlt,
  photoCredit,
  imageUrl,
  responsivePhoto,
  imageSet,
  formatPrice,
  ratingSummary,
  formatRating,
  reviewCountText,
  ratingText,
  createdDate,
  formatDate,
  isoDate,
  excerpt,
  fieldAria,
  invalidClass,
};
