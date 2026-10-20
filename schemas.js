const Joi = require("joi");
const { RESERVED_USERNAMES } = require("./utils/sample");

const PRICE_MSG = "Enter a price per night, like 18 or 18.50. Use 0 for free.";
const PRICE_MAX = 1000;

const text = (label, max) =>
  Joi.string()
    .trim()
    .max(max)
    .required()
    .messages({
      "string.empty": `Enter ${label}.`,
      "any.required": `Enter ${label}.`,
      "string.base": `Enter ${label}.`,
      "string.max": `Keep ${label} to ${max} characters or fewer.`,
    });

// Form values arrive as strings. A plain Joi.number() would round 12.345
// and accept 1e2, so the price is matched as text and converted afterwards.
const price = Joi.string()
  .trim()
  .pattern(/^\d{1,4}(\.\d{1,2})?$/)
  .required()
  .custom((value, helpers) => {
    const n = Number(value);
    return n > PRICE_MAX ? helpers.error("price.max") : n;
  })
  .messages({
    "string.pattern.base": PRICE_MSG,
    "string.empty": PRICE_MSG,
    "string.base": PRICE_MSG,
    "any.required": PRICE_MSG,
    "price.max": `Prices go up to $${PRICE_MAX} a night.`,
  });

module.exports.campSchema = Joi.object({
  camp: Joi.object({
    title: text("a camp name", 100),
    location: text("a location", 120),
    price,
    description: text("a description", 2000),
  })
    .required()
    .messages({ "any.required": "Fill in the camp details." }),
  deleteImages: Joi.array().items(Joi.string().max(200)).max(20),
}).messages({ "object.unknown": "The form had an unexpected field." });

module.exports.reviewSchema = Joi.object({
  review: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required().messages({
      "number.base": "Choose a star rating from 1 to 5.",
      "number.min": "Choose a star rating from 1 to 5.",
      "number.max": "Choose a star rating from 1 to 5.",
      "number.integer": "Choose a star rating from 1 to 5.",
      "any.required": "Choose a star rating from 1 to 5.",
    }),
    body: text("your review", 1000),
  })
    .required()
    .messages({ "any.required": "Write a review and choose a rating." }),
});

module.exports.registerSchema = Joi.object({
  username: Joi.string()
    .trim()
    .min(3)
    .max(30)
    .pattern(/^[A-Za-z0-9_.-]+$/)
    .required()
    .custom((value, helpers) =>
      RESERVED_USERNAMES.includes(value.toLowerCase()) ? helpers.error("username.reserved") : value,
    )
    .messages({
      "username.reserved": "That username is taken. Try another.",
      "string.empty": "Choose a username.",
      "any.required": "Choose a username.",
      "string.min": "Usernames are 3 to 30 characters.",
      "string.max": "Usernames are 3 to 30 characters.",
      "string.pattern.base": "Usernames can use letters, numbers, dots, dashes and underscores.",
    }),
  email: Joi.string()
    .trim()
    .max(254)
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      "string.empty": "Enter your email address.",
      "any.required": "Enter your email address.",
      "string.email": "Enter a valid email address, like name@example.com.",
      "string.max": "Enter a valid email address, like name@example.com.",
    }),
  password: Joi.string().min(8).max(200).required().messages({
    "string.empty": "Choose a password of at least 8 characters.",
    "any.required": "Choose a password of at least 8 characters.",
    "string.min": "Choose a password of at least 8 characters.",
    "string.max": "Passwords can be up to 200 characters.",
  }),
});

module.exports.PRICE_MAX = PRICE_MAX;
