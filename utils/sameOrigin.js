// Refuses cross-site form posts. Browsers send Sec-Fetch-Site and Origin on
// every POST; requests with neither come from non-browser clients, which
// cannot carry a visitor's cookie. Behind Vercel the public host arrives in
// X-Forwarded-Host.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOriginWrite(req) {
  if (SAFE_METHODS.has(req.method)) return true;
  const site = req.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;
  const origin = req.get("origin");
  if (!origin) return !site;
  try {
    const expected = req.get("x-forwarded-host") || req.get("host");
    return new URL(origin).host === expected;
  } catch {
    return false;
  }
}

module.exports = function sameOriginWrites(req, res, next) {
  if (isSameOriginWrite(req)) return next();
  res.status(403).render("error", {
    status: 403,
    title: "This form was sent from another website",
    message:
      "NZ Camps only accepts forms sent from its own pages. Go back to NZ Camps, reload the page and try again.",
  });
};

module.exports.isSameOriginWrite = isSameOriginWrite;
