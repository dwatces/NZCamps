// Form errors as the templates show them: a summary at the top of the form,
// each item linking to its field, and the first message for each field shown
// next to it (GOV.UK-style). Errors come in as { field, message } objects, or
// as plain strings for problems that belong to no single field.

function formErrors(list = [], fieldIds = {}) {
  const summary = [];
  const byField = {};
  const seen = new Set();
  for (const item of list) {
    const { field = null, message } = typeof item === "string" ? { message: item } : item;
    const key = `${field}\u0000${message}`;
    if (!message || seen.has(key)) continue;
    seen.add(key);
    const id = field && Object.hasOwn(fieldIds, field) ? fieldIds[field] : null;
    summary.push({ message, href: id ? `#${id}` : null });
    if (id && !byField[field]) byField[field] = message;
  }
  return { errors: summary, fieldErrors: byField };
}

// Joi's details as { field, message }: the field is the last named key in
// the path ("camp.price" is "price", "deleteImages.0" is "deleteImages").
function joiErrors(error) {
  if (!error) return [];
  return error.details.map((d) => {
    const names = d.path.filter((p) => typeof p === "string");
    return { field: names[names.length - 1] || null, message: d.message };
  });
}

// Field name -> the id of the element the summary links to.
const CAMP_FIELDS = {
  title: "title",
  location: "location",
  price: "price",
  description: "description",
  image: "image",
  deleteImages: "remove-photos",
};
const REVIEW_FIELDS = { rating: "rating-1", body: "review-body" };
const REGISTER_FIELDS = { username: "username", email: "email", password: "password" };

module.exports = { formErrors, joiErrors, CAMP_FIELDS, REVIEW_FIELDS, REGISTER_FIELDS };
