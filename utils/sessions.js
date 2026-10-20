const crypto = require("crypto");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEV_SECRET = "nzcamps-local-development-secret-not-for-production";

// SECRET signs the session cookie. A missing value never stops the app
// (production settings cannot be checked from here), but it is logged on
// every cold start. The fallback is server-only and the same on every
// instance; "badsecret" (the old placeholder) still verifies older cookies.
function sessionSecret({ env = process.env, log = console.error } = {}) {
  if (env.SECRET) return env.SECRET;
  if (env.NODE_ENV === "production") {
    log("SECRET is not set. Set it in the hosting environment; using a fallback for now.");
    if (env.DB_URL) {
      const derived = crypto
        .createHash("sha256")
        .update("nzcamps-session:" + env.DB_URL)
        .digest("hex");
      return [derived, "badsecret"];
    }
    return [crypto.randomBytes(32).toString("hex")];
  }
  return DEV_SECRET;
}

// Sessions live in MongoDB once mongoose is connected, on mongoose's own
// client (one connection pool, not two). The store is only created after a
// successful connection: built earlier it crashes the process when the
// database is unreachable, and never recovers. Without DB_URL (local demo
// mode) sessions use the in-memory store. With DB_URL set but no connection
// (an outage), requests get a throwaway session object, so a visitor's real
// cookie is neither replaced nor extended.
function createSessionHolder({ dbUrl, secret }) {
  const options = {
    name: "connect.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: "auto", maxAge: WEEK_MS },
  };
  let mongoSession = null;
  let memorySession = null;
  let storeClient = null;
  const state = { store: null };

  function attachMongoStore() {
    if (mongoose.connection.readyState !== 1) return;
    const client = mongoose.connection.getClient();
    if (!client || client === storeClient) return;
    storeClient = client;
    const store = MongoStore.create({ client, touchAfter: 24 * 60 * 60 });
    store.on("error", (e) => console.error("session store error:", e && e.message));
    state.store = store;
    state.client = client;
    mongoSession = session({ ...options, store });
  }

  mongoose.connection.on("connected", attachMongoStore);
  attachMongoStore();

  function middleware(req, res, next) {
    if (!mongoSession) attachMongoStore();
    if (mongoSession) return mongoSession(req, res, next);
    if (!dbUrl) {
      if (!memorySession) memorySession = session(options);
      return memorySession(req, res, next);
    }
    req.session = {};
    next();
  }

  return { middleware, state, options };
}

module.exports = { sessionSecret, createSessionHolder, DEV_SECRET };
