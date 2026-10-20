const Camp = require("../models/camp");
const ExpressError = require("../utils/expressError");
const { storeImage, destroyImage, STORE_FAILED_MSG } = require("../cloudinary");
const { renderCampForm, campFormValues } = require("../utils/middleware");
const {
  findCampForShow,
  parseListQuery,
  listCamps,
  renderCampList,
} = require("../utils/campQueries");

const NOT_FOUND_MSG =
  "We couldn't find that location in New Zealand. Try a nearby town, lake or park.";
const GEOCODER_DOWN_MSG = "We couldn't check that location right now. Try again in a minute.";

// Only these fields can be set from a form (no mass assignment).
function pickCampFields(body) {
  const { title, location, price, description } = body;
  return { title, location, price: Number(price), description };
}

// Stores checked photos; null if the image host failed.
async function storeImages(files) {
  try {
    return await Promise.all((files || []).map(storeImage));
  } catch (err) {
    console.error("photo upload failed:", err && err.message);
    return null;
  }
}

async function geocodeOrMessage(req, location) {
  try {
    const coords = await req.app.locals.geocode(location);
    if (coords) return { coords };
    return { error: { field: "location", message: NOT_FOUND_MSG }, status: 422 };
  } catch (err) {
    console.error("geocoder failed:", err && err.message);
    return { error: { field: "location", message: GEOCODER_DOWN_MSG }, status: 503 };
  }
}

// "We placed it at Lake Tekapo, Mackenzie District, ..." (or the coordinates
// when the geocoder gives no name), so people can see where the pin went.
function placedAt({ name, lat, lng }) {
  const where = name || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  return `We placed it at ${where}.`;
}

const sameText = (a, b) =>
  String(a || "")
    .trim()
    .toLowerCase() ===
  String(b || "")
    .trim()
    .toLowerCase();

module.exports.index = async (req, res) => {
  const params = parseListQuery(req.query);
  renderCampList(res, params, await listCamps(params));
};

module.exports.newForm = (req, res) => {
  renderCampForm(res, { view: "camps/new", values: campFormValues() });
};

module.exports.createCamp = async (req, res) => {
  const fields = pickCampFields(req.body.camp);
  const formAgain = (status, error) =>
    renderCampForm(res, {
      status,
      view: "camps/new",
      values: campFormValues(req.body.camp),
      errors: [error],
    });

  const geo = await geocodeOrMessage(req, fields.location);
  if (!geo.coords) return formAgain(geo.status, geo.error);

  // Photos are stored only now, after every check has passed, so a refused
  // form never leaves orphaned uploads behind.
  const images = await storeImages(req.files);
  if (!images) return formAgain(503, { field: "image", message: STORE_FAILED_MSG });

  const camp = new Camp(fields);
  camp.geometry = { type: "Point", coordinates: [geo.coords.lng, geo.coords.lat] };
  camp.author = req.user._id;
  camp.images = images;

  await camp.save();
  req.flash("success", `Camp added. ${placedAt(geo.coords)}`);
  res.redirect(`/camps/${camp._id}`);
};

module.exports.showCamps = async (req, res) => {
  const camp = await findCampForShow(req.params.id);
  if (!camp) throw new ExpressError("Page not found", 404);
  res.render("camps/show", { camp });
};

module.exports.editForm = async (req, res) => {
  // isAuthor has already loaded the camp and checked ownership.
  renderCampForm(res, { view: "camps/edit", camp: req.camp });
};

module.exports.updateCamp = async (req, res) => {
  const camp = req.camp;
  const fields = pickCampFields(req.body.camp);
  const formAgain = (status, error) =>
    renderCampForm(res, {
      status,
      view: "camps/edit",
      camp,
      values: campFormValues(req.body.camp, req.body.deleteImages),
      errors: [error],
    });

  // The pin moves only when the location text changed; a place that can't
  // be found leaves the camp (and its pin) as it was.
  let geo = null;
  if (!sameText(fields.location, camp.location)) {
    geo = await geocodeOrMessage(req, fields.location);
    if (!geo.coords) return formAgain(geo.status, geo.error);
  }

  const added = await storeImages(req.files);
  if (!added) return formAgain(503, { field: "image", message: STORE_FAILED_MSG });

  // Only this camp's own images can be removed, whatever ids the form sent.
  const ids = new Set(req.body.deleteImages || []);
  const removed = camp.images.filter((img) => ids.has(String(img._id)));
  const removedIds = new Set(removed.map((img) => String(img._id)));

  Object.assign(camp, fields);
  if (geo) camp.geometry = { type: "Point", coordinates: [geo.coords.lng, geo.coords.lat] };
  camp.images = camp.images.filter((img) => !removedIds.has(String(img._id)));
  camp.images.push(...added);
  await camp.save();

  for (const img of removed) {
    await destroyImage(img.filename);
  }

  req.flash("success", geo ? `Camp updated. ${placedAt(geo.coords)}` : "Camp updated.");
  res.redirect(`/camps/${camp._id}`);
};

module.exports.deleteCamp = async (req, res) => {
  const camp = req.camp;
  for (let image of camp.images) {
    await destroyImage(image.filename);
  }
  await Camp.findByIdAndDelete(camp._id);
  req.flash("success", "Camp deleted.");
  res.redirect("/camps");
};
