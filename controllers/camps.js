const Camp = require("../models/camp");
const ExpressError = require("../utils/expressError");
const { storeImage, destroyImage, STORE_FAILED_MSG } = require("../cloudinary");
const { renderCampForm, campFormValues } = require("../middleware");
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
    return coords ? { coords } : { message: NOT_FOUND_MSG, status: 422 };
  } catch (err) {
    console.error("geocoder failed:", err && err.message);
    return { message: GEOCODER_DOWN_MSG, status: 503 };
  }
}

module.exports.index = async (req, res) => {
  const params = parseListQuery(req.query);
  renderCampList(res, params, await listCamps(params));
};

module.exports.newForm = (req, res) => {
  renderCampForm(res, { view: "camps/new", values: campFormValues() });
};

module.exports.createCamp = async (req, res) => {
  const fields = pickCampFields(req.body.camp);
  const geo = await geocodeOrMessage(req, fields.location);
  if (!geo.coords) {
    return renderCampForm(res, {
      status: geo.status,
      view: "camps/new",
      values: campFormValues(req.body.camp),
      errors: [geo.message],
    });
  }

  // Photos are stored only now, after every check has passed, so a refused
  // form never leaves orphaned uploads behind.
  const images = await storeImages(req.files);
  if (!images) {
    return renderCampForm(res, {
      status: 503,
      view: "camps/new",
      values: campFormValues(req.body.camp),
      errors: [STORE_FAILED_MSG],
    });
  }

  const camp = new Camp(fields);
  camp.geometry = { type: "Point", coordinates: [geo.coords.lng, geo.coords.lat] };
  camp.author = req.user._id;
  camp.images = images;

  await camp.save();
  req.flash("success", "Camp added.");
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
  const added = await storeImages(req.files);
  if (!added) {
    return renderCampForm(res, {
      status: 503,
      view: "camps/edit",
      camp,
      values: campFormValues(req.body.camp),
      errors: [STORE_FAILED_MSG],
    });
  }

  // Only this camp's own images can be removed, whatever ids the form sent.
  const ids = new Set(req.body.deleteImages || []);
  const removed = camp.images.filter((img) => ids.has(String(img._id)));
  const removedIds = new Set(removed.map((img) => String(img._id)));

  Object.assign(camp, pickCampFields(req.body.camp));
  camp.images = camp.images.filter((img) => !removedIds.has(String(img._id)));
  camp.images.push(...added);
  await camp.save();

  for (const img of removed) {
    await destroyImage(img.filename);
  }

  req.flash("success", "Camp updated.");
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
