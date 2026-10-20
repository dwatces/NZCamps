const Camp = require("../models/camp");
const Review = require("../models/review");
const ExpressError = require("../utils/expressError");

module.exports.createReview = async (req, res) => {
  const camp = await Camp.findById(req.params.id);
  if (!camp) throw new ExpressError("Page not found", 404);
  const { rating, body } = req.body.review;
  const review = new Review({ rating, body, author: req.user._id });
  camp.reviews.push(review);
  await review.save();
  await camp.save();
  req.flash("success", "Review posted.");
  res.redirect(`/camps/${camp._id}`);
};

module.exports.deleteReview = async (req, res) => {
  const { id, reviewId } = req.params;
  // The review must belong to this camp, not just exist.
  const camp = await Camp.findOneAndUpdate(
    { _id: id, reviews: reviewId },
    { $pull: { reviews: reviewId } },
  );
  if (!camp) throw new ExpressError("Page not found", 404);
  await Review.findByIdAndDelete(reviewId);
  req.flash("success", "Review deleted.");
  res.redirect(`/camps/${id}`);
};
