const opencage = require("opencage-api-client");

/* Geocode a New Zealand location to { lat, lng }, or null if not found.
   Uses OpenCage when OPENCAGE_ACCESS_TOKEN is set, otherwise the keyless
   OpenStreetMap Nominatim API (identified per its usage policy). */
async function geocodeNZ(location) {
  const query = location + ", New Zealand";

  if (process.env.OPENCAGE_ACCESS_TOKEN) {
    const geoData = await opencage.geocode({
      q: query,
      key: process.env.OPENCAGE_ACCESS_TOKEN,
    });
    if (!geoData || geoData.status.code !== 200 || geoData.results.length === 0) {
      return null;
    }
    return geoData.results[0].geometry;
  }

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nz&q=" +
    encodeURIComponent(query);
  const response = await fetch(url, {
    headers: { "User-Agent": "nz-camps (https://nz-camps.vercel.app)" },
  });
  if (!response.ok) return null;
  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

module.exports = geocodeNZ;
