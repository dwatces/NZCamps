const ExpressError = require("./utils/expressError");
const catchAsync = require("./utils/catchAsync");
const { campSchema, reviewSchema } = require("./schemas.js");
const Camp = require("./models/camp");
const Review = require("./models/review");

const CAMP_FIELDS = ["title", "location", "price", "description"];

// Strings to show back in a form after a failed submit.
function campFormValues(source = {}) {
  const values = {};
  for (const f of CAMP_FIELDS) {
    const v = source[f];
    values[f] = v === undefined || v === null || typeof v === "object" ? "" : String(v);
  }
  return values;
}

function validationMessages(error) {
  return [...new Set(error.details.map((d) => d.message))];
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

module.exports.renderCampForm = (res, { status = 200, view, camp, values, errors = [] }) =>
  res.status(status).render(view, { camp, values: values || campFormValues(camp), errors });

module.exports.campFormValues = campFormValues;

// A failed create re-renders the new form, a failed update the edit form,
// both with what the user typed and the list of problems.
module.exports.validateCamp = (req, res, next) => {
  const { error, value } = campSchema.validate(req.body, { abortEarly: false });
  const photoErrors = req.photoErrors || [];
  if (error || photoErrors.length) {
    const values = campFormValues((req.body && req.body.camp) || {});
    const errors = [...(error ? validationMessages(error) : []), ...photoErrors];
    if (req.camp) {
      return module.exports.renderCampForm(res, {
        status: 422,
        view: "camps/edit",
        camp: req.camp,
        values,
        errors,
      });
    }
    return module.exports.renderCampForm(res, { status: 422, view: "camps/new", values, errors });
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

module.exports.validateReview = (req, res, next) => {
  const { error, value } = reviewSchema.validate(req.body, { abortEarly: false });
  if (error) {
    req.flash("error", validationMessages(error).join(" "));
    return res.redirect(`/camps/${req.params.id}`);
  }
  req.body.review = value.review;
  next();
};
