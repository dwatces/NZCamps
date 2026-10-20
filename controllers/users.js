const User = require("../models/user");
const { registerSchema } = require("../schemas");

const DUPLICATE_MSG = "That username or email is already registered.";

module.exports.renderRegister = (req, res) => {
  res.render("users/register", { values: {}, errors: [] });
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
  if (error) {
    const errors = [...new Set(error.details.map((d) => d.message))];
    return res.status(422).render("users/register", { values, errors });
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
      res.redirect("/camps");
    });
  } catch (e) {
    // Never show raw database errors (they name indexes and confirm emails).
    const duplicate = e && (e.name === "UserExistsError" || e.code === 11000);
    if (!duplicate) return next(e);
    return res.status(422).render("users/register", { values, errors: [DUPLICATE_MSG] });
  }
};

module.exports.renderLogin = (req, res) => {
  res.render("users/login");
};

module.exports.login = (req, res) => {
  req.flash("success", "Welcome back!");
  const redirectUrl = req.session.returnTo || "/camps";
  delete req.session.returnTo;
  res.redirect(redirectUrl);
};

module.exports.renderLogout = (req, res) => {
  res.set("Allow", "POST").status(405).render("users/logout");
};

module.exports.logout = (req, res) => {
  req.logout();
  req.flash("success", "Logged out!");
  res.redirect("/camps");
};
