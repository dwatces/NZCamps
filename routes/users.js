const express = require("express");
const router = express.Router();
const catchAsync = require("../utils/catchAsync");
const users = require("../controllers/users");

router.route("/register").get(users.renderRegister).post(catchAsync(users.register));

router
  .route("/login")
  .get(users.renderLogin)
  .post(users.storeReturnTo, users.authenticate, users.login);

// Logging out changes state, so it is a POST (a link or image elsewhere
// cannot log anyone out). An old GET bookmark gets a page with the button.
router.route("/logout").post(users.logout).get(users.renderLogout);

module.exports = router;
