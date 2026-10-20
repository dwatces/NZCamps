const User = require("../models/user");
const { registerSchema } = require("../schemas");
const passport = require("passport");
const { displayName } = require("../utils/viewHelpers");
const { safeReturnTo } = require("../utils/returnTo");

const DUPLICATE_MSG = "That username or email is already registered.";

module.exports.renderRegister = (req, res) => {
  res.render("users/register", {
    values: {},
    errors: [],
    returnTo: safeReturnTo(req.query.returnTo),
  });
};

module.exports.register = async (req, res, next) => {
  const { error, value } = registerSchema.validate(
    {
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
    },
    { abortEarly: false },
  );
  const values = {
    username: typeof req.body.username === "string" ? req.body.username : "",
    email: typeof req.body.email === "string" ? req.body.email : "",
  };
  const returnTo = safeReturnTo(req.body.returnTo);
  if (error) {
    const errors = [...new Set(error.details.map((d) => d.message))];
    return res.status(422).render("users/register", { values, errors, returnTo });
  }

  try {
    const user = new User({ email: value.email, username: value.username });
    await User.register(user, value.password);
    req.login(user, (err) => {
      if (err) return next(err);
      req.flash(
        "success",
        `Welcome to NZ Camps, ${value.username}. Add a camp you've stayed at, or review one below.`,
      );
      res.redirect(returnTo || "/camps");
    });
  } catch (e) {
    // Never show raw database errors (they name indexes and confirm emails).
    const duplicate = e && (e.name === "UserExistsError" || e.code === 11000);
    if (!duplicate) return next(e);
    return res.status(422).render("users/register", { values, errors: [DUPLICATE_MSG], returnTo });
  }
};

module.exports.renderLogin = (req, res) => {
  res.render("users/login", { returnTo: safeReturnTo(req.query.returnTo) });
};

// Passport 0.6+ regenerates the session on login (closing session fixation),
// which drops req.session.returnTo; storeReturnTo keeps a copy first. A
// returnTo sent with the form (from a "Log in to leave a review" link) wins
// over one saved in the session; both are checked before use.
module.exports.storeReturnTo = (req, res, next) => {
  const fromForm = safeReturnTo(req.body && req.body.returnTo);
  if (fromForm) res.locals.returnTo = fromForm;
  else if (req.session && req.session.returnTo) res.locals.returnTo = req.session.returnTo;
  next();
};

// A failed login goes back to the form, keeping a returnTo from the form.
module.exports.authenticate = (req, res, next) => {
  const back = safeReturnTo(req.body && req.body.returnTo);
  passport.authenticate("local", {
    failureFlash: true,
    failureRedirect: back ? `/login?returnTo=${encodeURIComponent(back)}` : "/login",
  })(req, res, next);
};

module.exports.login = (req, res) => {
  req.flash("success", `Welcome back, ${displayName(req.user)}.`);
  const redirectUrl = res.locals.returnTo || "/camps";
  delete req.session.returnTo;
  res.redirect(redirectUrl);
};

module.exports.renderLogout = (req, res) => {
  res.set("Allow", "POST").status(405).render("users/logout");
};

module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash("success", "You've logged out.");
    res.redirect("/camps");
  });
};
