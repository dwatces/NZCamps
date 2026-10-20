const path = require("node:path");
const mongoose = require("mongoose");

const ROOT = path.join(__dirname, "..", "..");

// Fixed NZ coordinates; "Nowhere" stands in for a place the geocoder cannot find.
async function stubGeocode(location) {
  if (/nowhere/i.test(String(location))) return null;
  return { lat: -41.2865, lng: 174.7762 };
}

// Builds the app for one test file. Environment is set before the app is
// required so a developer's .env (never loaded under NODE_ENV=test) and any
// real service credentials cannot leak in.
async function makeApp({ dbUri, env = {} } = {}) {
  process.env.NODE_ENV = "test";
  process.env.SECRET = "test-only-session-secret";
  for (const name of [
    "OPENCAGE_ACCESS_TOKEN",
    "CLOUDINARY_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_SECRET",
    "BASE_URL",
  ]) {
    process.env[name] = "";
  }
  if (dbUri) process.env.DB_URL = dbUri;
  else delete process.env.DB_URL;
  Object.assign(process.env, env);

  const app = require(path.join(ROOT, "index"));
  app.locals.geocode = stubGeocode;
  if (dbUri) await mongoose.connection.asPromise();
  return app;
}

async function closeApp(app) {
  const store = app && app.locals.sessionStore;
  if (store && typeof store.close === "function") await store.close();
  await mongoose.disconnect();
}

module.exports = { makeApp, closeApp, stubGeocode, ROOT };
