const express = require("express");
const router = express.Router();
const camps = require("../controllers/camps");
const catchAsync = require("../utils/catchAsync");
const { isLoggedIn, isAuthor, validateCamp } = require("../middleware");
const { storage } = require("../cloudinary");
const multer = require("multer");
const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 } });

router
  .route("/")
  .get(catchAsync(camps.index))
  .post(
    isLoggedIn,
    upload.array("image"),
    validateCamp,
    catchAsync(camps.createCamp)
  );

router.get("/new", isLoggedIn, camps.newForm);

router
  .route("/:id")
  .get(catchAsync(camps.showCamps))
  .put(
    isLoggedIn,
    isAuthor,
    upload.array("image"),
    validateCamp,
    catchAsync(camps.updateCamp)
  )
  .delete(isLoggedIn, isAuthor, catchAsync(camps.deleteCamp));

router.get("/:id/edit", isLoggedIn, isAuthor, catchAsync(camps.editForm));

module.exports = router;
