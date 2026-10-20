const express = require("express");
const router = express.Router({ mergeParams: true });
const {
  validateReview,
  isLoggedIn,
  isReviewAuthor,
  validateObjectId,
} = require("../utils/middleware");
const reviews = require("../controllers/reviews");
const catchAsync = require("../utils/catchAsync");

router.post(
  "/",
  validateObjectId("id"),
  isLoggedIn,
  validateReview,
  catchAsync(reviews.createReview),
);

router.delete(
  "/:reviewId",
  validateObjectId("id", "reviewId"),
  isLoggedIn,
  isReviewAuthor,
  catchAsync(reviews.deleteReview),
);

module.exports = router;
