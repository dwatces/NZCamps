const runtimeConfig = require("./runtimeConfig");

const NOMINATIM_UA = "nz-camps (https://nz-camps.vercel.app)";

// Geocodes a New Zealand place to { lat, lng, name }, or null when the place
// is not found. Uses OpenCage when OPENCAGE_ACCESS_TOKEN is set, otherwise
// the keyless OpenStreetMap Nominatim API (identified per its usage policy).
// A slow or failing geocoder throws (after geocodeTimeoutMs) instead of
// using up the function's time budget; the caller shows a plain message.
async function geocodeNZ(location) {
  const query = `${location}, New Zealand`;
  const signal = AbortSignal.timeout(runtimeConfig.geocodeTimeoutMs);
  const key = process.env.OPENCAGE_ACCESS_TOKEN;

  if (key) {
    const url = new URL("https://api.opencagedata.com/geocode/v1/json");
    url.search = new URLSearchParams({
      q: query,
      key,
      countrycode: "nz",
      limit: "1",
      no_annotations: "1",
    }).toString();
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`OpenCage answered ${response.status}`);
    const data = await response.json();
    const first = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!first || !first.geometry) return null;
    return { lat: first.geometry.lat, lng: first.geometry.lng, name: first.formatted || null };
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    format: "json",
    limit: "1",
    countrycodes: "nz",
    q: query,
  }).toString();
  const response = await fetch(url, { signal, headers: { "User-Agent": NOMINATIM_UA } });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) return null;
  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    name: results[0].display_name || null,
  };
}

module.exports = geocodeNZ;
