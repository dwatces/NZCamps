const helmet = require("helmet");

// Content security policy: every script, style and font comes from this
// site (vendored, no inline code). Images may also come from Cloudinary
// (uploads) and OpenStreetMap (map tiles), or be data URIs (uploads without
// Cloudinary). upgrade-insecure-requests is off: Vercel is HTTPS-only already
// and the directive breaks plain-HTTP local runs.
//
// Referrer-Policy is the browser default rather than helmet's no-referrer:
// OpenStreetMap's tile servers refuse tile requests that carry no Referer.
module.exports = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'"],
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        "https://res.cloudinary.com",
        "https://*.tile.openstreetmap.org",
      ],
      "connect-src": ["'self'"],
      "font-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "upgrade-insecure-requests": null,
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});
