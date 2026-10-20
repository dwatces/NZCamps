const Camp = require("../models/camp");
const Review = require("../models/review");

module.exports.createReview = async (req, res) => {
  const camp = await Camp.findById(req.params.id);
  const review = new Review(req.body.review);
  review.author = req.user._id;
  camp.reviews.push(review);
  await review.save();
  await camp.save();
  req.flash("success", "Review saved successfully");
  res.redirect(`/camps/${camp._id}`);
};

module.exports.deleteReview = async (req, res) => {
  const { id, reviewId } = req.params;
  await Camp.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
  await Review.findByIdAndDelete(reviewId);
  req.flash("success", "Review deleted successfully");
  res.redirect(`/camps/${id}`);
};
