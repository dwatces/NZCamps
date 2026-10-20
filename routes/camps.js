const express = require("express");
const router = express.Router();
const camps = require("../controllers/camps");
const catchAsync = require("../utils/catchAsync");
const { isLoggedIn, isAuthor, validateCamp, validateObjectId } = require("../utils/middleware");
const { acceptPhotos } = require("../cloudinary");

const validId = validateObjectId("id");

router
  .route("/")
  .get(catchAsync(camps.index))
  .post(isLoggedIn, acceptPhotos, validateCamp, catchAsync(camps.createCamp));

router.get("/new", isLoggedIn, camps.newForm);

router
  .route("/:id")
  .get(validId, catchAsync(camps.showCamps))
  .put(validId, isLoggedIn, isAuthor, acceptPhotos, validateCamp, catchAsync(camps.updateCamp))
  .delete(validId, isLoggedIn, isAuthor, catchAsync(camps.deleteCamp));

router.get("/:id/edit", validId, isLoggedIn, isAuthor, catchAsync(camps.editForm));

module.exports = router;
