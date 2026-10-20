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

// Just the first image (for cards), also without bytes.
const FIRST_IMAGE_WITHOUT_BYTES = {
  $map: {
    input: { $slice: [{ $ifNull: ["$images", []] }, 1] },
    as: "img",
    in: imageWithoutBytes("$$img"),
  },
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

// ---- The camps list: search, sort and pages ----

const PAGE_SIZE = 12;
const SORT_OPTIONS = [
  ["newest", "Newest first"],
  ["price", "Price, low to high"],
  ["rating", "Highest rated"],
];
const SORT_KEYS = SORT_OPTIONS.map(([key]) => key);

// Query string values can be anything (arrays, objects, huge numbers), so
// each one is checked and anything unexpected falls back to the default.
function parseListQuery(query = {}) {
  const q = typeof query.q === "string" ? query.q.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const sort =
    typeof query.sort === "string" && SORT_KEYS.includes(query.sort) ? query.sort : "newest";
  const page =
    typeof query.page === "string" && /^[1-9]\d{0,4}$/.test(query.page) ? Number(query.page) : 1;
  return { q, sort, page };
}

// The search text as a regular expression source: matched literally, and a
// vowel also matches its macron form, so "taupo" finds "Taupō".
const MACRONS = { a: "āĀ", e: "ēĒ", i: "īĪ", o: "ōŌ", u: "ūŪ" };
function searchPattern(q) {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")
    .replace(/[aeiou]/gi, (v) => `[${v}${MACRONS[v.toLowerCase()]}]`);
}

// The link for one page of the list, keeping the search and sort.
function listUrl({ q, sort }, page = 1) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort && sort !== "newest") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/camps?${qs}` : "/camps";
}

const SORT_STAGES = {
  newest: { _id: -1 },
  price: { price: 1, _id: -1 },
  // Highest average first; camps with no reviews last.
  rating: { hasRating: -1, ratingAvg: -1, reviewCount: -1, _id: -1 },
};

// One aggregation (a single database command, whatever the number of camps)
// returns the total, the rows for this page with their rating summary and
// first image, and the map points for every matching camp.
async function listCamps({ q, sort, page }) {
  const pattern = q ? { $regex: searchPattern(q), $options: "i" } : null;
  const [result] = await Camp.aggregate([
    { $match: pattern ? { $or: [{ title: pattern }, { location: pattern }] } : {} },
    {
      $lookup: {
        from: "reviews",
        let: { ids: { $ifNull: ["$reviews", []] } },
        pipeline: [
          { $match: { $expr: { $in: ["$_id", "$$ids"] } } },
          { $project: { _id: 0, rating: 1 } },
        ],
        as: "ratings",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { id: "$author" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$id"] } } },
          { $project: { _id: 0, username: 1 } },
        ],
        as: "authors",
      },
    },
    {
      $project: {
        title: 1,
        location: 1,
        price: 1,
        isDemo: 1,
        createdAt: 1,
        geometry: 1,
        description: { $substrCP: [{ $ifNull: ["$description", ""] }, 0, 300] },
        author: { $arrayElemAt: ["$authors", 0] },
        reviewCount: { $size: "$ratings" },
        ratingAvg: { $avg: "$ratings.rating" },
        hasRating: { $gt: [{ $size: "$ratings" }, 0] },
        images: FIRST_IMAGE_WITHOUT_BYTES,
      },
    },
    {
      $facet: {
        total: [{ $count: "n" }],
        rows: [
          { $sort: SORT_STAGES[sort] },
          { $skip: (page - 1) * PAGE_SIZE },
          { $limit: PAGE_SIZE },
        ],
        map: [{ $project: { title: 1, location: 1, price: 1, geometry: 1, isDemo: 1, author: 1 } }],
      },
    },
  ]);
  return {
    rows: result.rows,
    total: result.total.length ? result.total[0].n : 0,
    mapCamps: result.map,
  };
}

// The same list over the demo-mode sample camps, in memory.
function listDemoCamps(camps, { q, sort, page }) {
  const re = q ? new RegExp(searchPattern(q), "i") : null;
  const matched = camps.filter((c) => !re || re.test(c.title) || re.test(c.location));
  const newest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const compare = {
    newest,
    price: (a, b) => a.price - b.price || newest(a, b),
    rating: (a, b) =>
      (b.reviewCount > 0) - (a.reviewCount > 0) ||
      (b.ratingAvg || 0) - (a.ratingAvg || 0) ||
      b.reviewCount - a.reviewCount ||
      newest(a, b),
  }[sort];
  const sorted = [...matched].sort(compare);
  return {
    rows: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: matched.length,
    mapCamps: matched,
  };
}

// "8 camps", "1 camp matches “Tekapo”", "No camps match “xyz”".
function countText(total, q) {
  const camps = `${total} camp${total === 1 ? "" : "s"}`;
  if (!q) return total ? camps : "No camps yet.";
  if (!total) return `No camps match \u201c${q}\u201d.`;
  return `${camps} ${total === 1 ? "matches" : "match"} \u201c${q}\u201d`;
}

// Renders the list page; demo mode and the database share it.
function renderCampList(res, params, { rows, total, mapCamps }) {
  res.render("camps/index", {
    camps: rows,
    total,
    mapCamps,
    params,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    countText: countText(total, params.q),
    sortOptions: SORT_OPTIONS,
    listUrl,
  });
}

module.exports = {
  AUTHOR,
  IMAGES_WITHOUT_BYTES,
  imageWithoutBytes,
  findCampForShow,
  PAGE_SIZE,
  parseListQuery,
  searchPattern,
  listUrl,
  listCamps,
  listDemoCamps,
  countText,
  renderCampList,
};
