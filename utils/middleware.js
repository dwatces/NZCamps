const ExpressError = require("./expressError");
const catchAsync = require("./catchAsync");
const { campSchema, reviewSchema } = require("../schemas.js");
const Camp = require("../models/camp");
const Review = require("../models/review");
const { formErrors, joiErrors, CAMP_FIELDS, REVIEW_FIELDS } = require("./formErrors");
const { findCampForShow } = require("./campQueries");
const { MAX_CAMP_PHOTOS } = require("../cloudinary");

const TEXT_FIELDS = ["title", "location", "price", "description"];
const asText = (v) => (v === undefined || v === null || typeof v === "object" ? "" : String(v));

// Strings to show back in a form after a failed submit (or a camp's own
// values when the edit form first opens).
function campFormValues(source = {}, deleteImages = []) {
  const values = {};
  for (const f of TEXT_FIELDS) values[f] = asText(source[f]);
  // A stored price of 18.5 opens the edit form as 18.50, as the form's help
  // text and the camp pages write it. Typed values are kept as typed.
  if (typeof source.price === "number" && !Number.isInteger(source.price)) {
    values.price = source.price.toFixed(2);
  }
  values.deleteImages = [].concat(deleteImages || []).filter((v) => typeof v === "string");
  return values;
}

// 404 for any named route parameter that is not a 24-character hex ObjectId.
// (mongoose.isValidObjectId also accepts any 12-character string.)
const OBJECT_ID = /^[a-f0-9]{24}$/i;
module.exports.validateObjectId =
  (...names) =>
  (req, res, next) => {
    for (const name of names) {
      if (!OBJECT_ID.test(req.params[name])) return next(new ExpressError("Page not found", 404));
    }
    next();
  };

// What the visitor was trying to do, for the "log in first" message.
function loginPrompt(req) {
  const url = req.originalUrl.split("?")[0];
  if (url === "/camps/new" || (url === "/camps" && req.method === "POST"))
    return "Log in to add a camp.";
  if (/\/reviews(\/|$)/.test(url)) return "Log in to leave a review.";
  return "Log in to continue.";
}

module.exports.isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    // Only a page can be returned to; a POST or DELETE URL cannot.
    if (req.method === "GET") req.session.returnTo = req.originalUrl;
    req.flash("error", loginPrompt(req));
    return res.redirect("/login");
  }
  next();
};

// Renders the add or edit form, with what was typed and any problems.
module.exports.renderCampForm = (res, { status = 200, view, camp, values, errors = [] }) =>
  res.status(status).render(view, {
    camp,
    values: values || campFormValues(camp),
    ...formErrors(errors, CAMP_FIELDS),
  });

module.exports.campFormValues = campFormValues;

// The photo limit for one camp: what it keeps plus what is added.
function photoLimitError(camp, deleteIds, added) {
  if (!added) return null;
  const removing = new Set(deleteIds || []);
  const keeping = (camp ? camp.images : []).filter((img) => !removing.has(String(img._id))).length;
  const room = Math.max(0, MAX_CAMP_PHOTOS - keeping);
  if (keeping + added <= MAX_CAMP_PHOTOS) return null;
  return {
    field: "image",
    message: room
      ? `A camp can have up to ${MAX_CAMP_PHOTOS} photos. You can add ${room} more.`
      : `A camp can have up to ${MAX_CAMP_PHOTOS} photos. Remove one to add another.`,
  };
}

// A failed create re-renders the new form, a failed update the edit form,
// both with what the user typed, a summary of the problems and a message
// next to each field.
module.exports.validateCamp = (req, res, next) => {
  const { error, value } = campSchema.validate(req.body, { abortEarly: false });
  const errors = [
    ...joiErrors(error),
    ...(req.photoErrors || []).map((message) => ({ field: "image", message })),
  ];
  if (!error && !req.photoErrors) {
    const tooMany = photoLimitError(req.camp, value.deleteImages, (req.files || []).length);
    if (tooMany) errors.push(tooMany);
  }
  if (errors.length) {
    const body = req.body || {};
    return module.exports.renderCampForm(res, {
      status: 422,
      view: req.camp ? "camps/edit" : "camps/new",
      camp: req.camp,
      values: campFormValues(body.camp || {}, body.deleteImages),
      errors,
    });
  }
  req.body.camp = value.camp;
  req.body.deleteImages = value.deleteImages;
  next();
};

module.exports.isAuthor = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const camp = await Camp.findById(id);
  if (!camp) throw new ExpressError("Page not found", 404);
  if (!camp.author || !camp.author.equals(req.user._id)) {
    req.flash("error", "You can only change camps you added.");
    return res.redirect(`/camps/${id}`);
  }
  req.camp = camp;
  next();
});

module.exports.isReviewAuthor = catchAsync(async (req, res, next) => {
  const { id, reviewId } = req.params;
  const review = await Review.findById(reviewId);
  if (!review) throw new ExpressError("Page not found", 404);
  if (!review.author || !review.author.equals(req.user._id)) {
    req.flash("error", "You can only delete your own reviews.");
    return res.redirect(`/camps/${id}`);
  }
  next();
});

// A review that fails its checks re-renders the camp page with the typed
// text kept and the message next to the stars or the text box.
module.exports.validateReview = catchAsync(async (req, res, next) => {
  const { error, value } = reviewSchema.validate(req.body, { abortEarly: false });
  if (!error) {
    req.body.review = value.review;
    return next();
  }
  const camp = await findCampForShow(req.params.id);
  if (!camp) throw new ExpressError("Page not found", 404);
  const typed = (req.body && req.body.review) || {};
  res.status(422).render("camps/show", {
    camp,
    reviewValues: { rating: asText(typed.rating), body: asText(typed.body) },
    ...formErrors(joiErrors(error), REVIEW_FIELDS),
  });
});
