const Camp = require("../models/camp");
const ExpressError = require("../utils/expressError");
const { fileToImage, destroyImage } = require("../cloudinary");
const { renderCampForm, campFormValues } = require("../middleware");

const NOT_FOUND_MSG =
  "We couldn't find that location in New Zealand. Try a nearby town, lake or park.";
const GEOCODER_DOWN_MSG = "We couldn't check that location right now. Try again in a minute.";

// Only these fields can be set from a form (no mass assignment).
function pickCampFields(body) {
  const { title, location, price, description } = body;
  return { title, location, price: Number(price), description };
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

// Authors are populated with their username only: never email, hash or salt.
const AUTHOR = { path: "author", select: "username" };

module.exports.index = async (req, res) => {
  const camps = await Camp.find(
    {},
    "title location description price images geometry reviews author isDemo",
  )
    .populate({ path: "reviews", select: "rating" })
    .populate(AUTHOR)
    .lean();
  res.render("camps/index", { camps });
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

  const camp = new Camp(fields);
  camp.geometry = { type: "Point", coordinates: [geo.coords.lng, geo.coords.lat] };
  camp.author = req.user._id;
  camp.images = (req.files || []).map(fileToImage);

  await camp.save();
  req.flash("success", "Camp added.");
  res.redirect(`/camps/${camp._id}`);
};

module.exports.showCamps = async (req, res) => {
  const camp = await Camp.findById(req.params.id)
    .populate({ path: "reviews", populate: AUTHOR })
    .populate(AUTHOR);
  if (!camp) throw new ExpressError("Page not found", 404);
  res.render("camps/show", { camp });
};

module.exports.editForm = async (req, res) => {
  // isAuthor has already loaded the camp and checked ownership.
  renderCampForm(res, { view: "camps/edit", camp: req.camp });
};

module.exports.updateCamp = async (req, res) => {
  const camp = req.camp;
  Object.assign(camp, pickCampFields(req.body.camp));
  camp.images.push(...(req.files || []).map(fileToImage));
  await camp.save();

  if (req.body.deleteImages) {
    for (let filename of req.body.deleteImages) {
      await destroyImage(filename);
    }
    await camp.updateOne({
      $pull: { images: { filename: { $in: req.body.deleteImages } } },
    });
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
