const express = require("express");
const router = express.Router();
const camps = require("../controllers/camps");
const catchAsync = require("../utils/catchAsync");
const { isLoggedIn, isAuthor, validateCamp, validateObjectId } = require("../middleware");
const { storage } = require("../cloudinary");
const multer = require("multer");
const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 } });

const validId = validateObjectId("id");

router
  .route("/")
  .get(catchAsync(camps.index))
  .post(isLoggedIn, upload.array("image"), validateCamp, catchAsync(camps.createCamp));

router.get("/new", isLoggedIn, camps.newForm);

router
  .route("/:id")
  .get(validId, catchAsync(camps.showCamps))
  .put(
    validId,
    isLoggedIn,
    isAuthor,
    upload.array("image"),
    validateCamp,
    catchAsync(camps.updateCamp),
  )
  .delete(validId, isLoggedIn, isAuthor, catchAsync(camps.deleteCamp));

router.get("/:id/edit", validId, isLoggedIn, isAuthor, catchAsync(camps.editForm));

module.exports = router;
