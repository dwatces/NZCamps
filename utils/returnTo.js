// Where to go after logging in or signing up, when a link asks for it
// (/login?returnTo=/camps/<id>). Only a camp page or the new-camp form on
// this site qualifies, so the parameter cannot send anyone elsewhere.
const SAFE_RETURN = /^\/camps\/(?:new|[a-f0-9]{24}|demo\d{1,2})$/;

const safeReturnTo = (value) =>
  typeof value === "string" && SAFE_RETURN.test(value) ? value : null;

module.exports = { safeReturnTo };
