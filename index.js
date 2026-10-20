// Local development reads .env (Node's built-in loader; existing variables
// win, as with dotenv). Tests and production never read it.
if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: fine.
  }
}
const express = require("express");
const app = express();
const path = require("path");
const mongoose = require("mongoose");
const ejsMate = require("ejs-mate");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const ExpressError = require("./utils/expressError");
const catchAsync = require("./utils/catchAsync");
const { validateObjectId } = require("./middleware");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user");
const userRoutes = require("./routes/users");
const campsRoutes = require("./routes/camps");
const reviewRoutes = require("./routes/review");
const mongoSanitize = require("express-mongo-sanitize");
const runtimeConfig = require("./utils/runtimeConfig");
const { sessionSecret, createSessionHolder } = require("./utils/sessions");
const sameOriginWrites = require("./utils/sameOrigin");
const demoCamps = require("./seeds/demoData");
const { parseListQuery, listDemoCamps, renderCampList } = require("./utils/campQueries");
const dbUrl = process.env.DB_URL;

// One connection per serverless instance, started at module load and reused.
// If that first connection fails (a cold start during a network blip), a
// later request tries again, at most once per reconnectBackoffMs. Once a
// connection has been made, the driver handles drops and reconnects itself.
let connecting = Promise.resolve();
let lastAttempt = 0;
let connectFailed = false;
function connect() {
  lastAttempt = Date.now();
  connectFailed = false;
  connecting = mongoose
    .connect(dbUrl, {
      serverSelectionTimeoutMS: runtimeConfig.serverSelectionTimeoutMS,
      maxPoolSize: 5,
    })
    .catch((e) => {
      connectFailed = true;
      console.error("mongo connect failed:", e.message);
    });
}
if (dbUrl) connect();
else console.warn("DB_URL not set - running without database");

const db = mongoose.connection;
db.on("error", (e) => console.error("connection error:", e && e.message));
db.once("open", () => {
  console.log("mongodb connected");
});

// Seam for tests: controllers geocode through app.locals so a stub can be swapped in.
app.locals.geocode = require("./utils/geocode");
Object.assign(app.locals, require("./utils/viewHelpers"));
{
  const uploads = require("./cloudinary");
  app.locals.maxCampPhotos = uploads.MAX_CAMP_PHOTOS;
  app.locals.maxPhotosPerUpload = uploads.MAX_PHOTOS;
  app.locals.maxPhotoBytes = uploads.MAX_PHOTO_BYTES;
}

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// Vercel terminates HTTPS in front of the function; this lets secure cookies work.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Defaults for the layout, so an error raised before the session middleware
// still renders the normal error page.
app.use((req, res, next) => {
  res.locals.user = null;
  res.locals.success = [];
  res.locals.error = [];
  res.locals.demoBanner = "";
  // For aria-current in the header: the path, and whether a query string
  // (search, page, returnTo) makes this a variant of that page.
  res.locals.currentPath = req.path;
  res.locals.currentHasQuery = req.originalUrl.includes("?");
  // BASE_URL only builds absolute URLs (canonical, og:url, og:image). Navigation links
  // stay relative so a preview deployment never sends people to production.
  const base = (process.env.BASE_URL || "").replace(/\/+$/, "");
  res.locals.siteOrigin = base || `${req.protocol}://${req.get("host")}`;
  res.locals.canonicalUrl = res.locals.siteOrigin + req.path;
  next();
});

app.use(require("./utils/securityHeaders"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
// Express 4's mime table predates AVIF (Vercel's CDN serves public/ itself
// and already knows the type; this keeps local runs correct).
express.static.mime.define({ "image/avif": ["avif"] });
app.use(express.static(path.join(__dirname, "public")));
app.use(mongoSanitize());

// Serverless: the function freezes between requests, so the boot-time connect
// may still be in flight on the first request. Wait for it (bounded) before
// sessions are read, so a cold start finds the session store ready. A failed
// connection is retried here, on the request path, rather than on a timer:
// a frozen instance runs no timers, and a timer would keep tests alive.
app.use(async (req, res, next) => {
  if (dbUrl && mongoose.connection.readyState !== 1) {
    const due = Date.now() - lastAttempt >= runtimeConfig.reconnectBackoffMs;
    if (connectFailed && mongoose.connection.readyState === 0 && due) connect();
    let timer;
    await Promise.race([
      connecting,
      new Promise((resolve) => {
        timer = setTimeout(resolve, runtimeConfig.dbWaitMs);
      }),
    ]);
    clearTimeout(timer);
  }
  next();
});

// Embedded photos are served before sessions: an image response never
// looks up or sets a session cookie.
app.get(
  "/camps/:id/images/:imageId",
  validateObjectId("id", "imageId"),
  catchAsync(require("./controllers/images").serveImage),
);

app.use(sameOriginWrites);

const sessions = createSessionHolder({ dbUrl, secret: sessionSecret() });
app.locals.sessionState = sessions.state;
app.use(sessions.middleware);
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Flash messages are read only when there are some: reading creates an empty
// flash object, which would save a session (and set a cookie) for every visit.
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  if (req.session && req.session.flash) {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
  }
  next();
});

// DEMO MODE: without a database connection, camp pages render the sample
// camps, every page shows a banner saying so, and writes get a 503 page
// directly: no flash and no session write, so a returning visitor's real
// cookie is left alone.
const NO_DB = dbUrl
  ? "The database isn't reachable right now"
  : "This copy of NZ Camps has no database connected";
const OUTAGE_MSG = `${NO_DB}, so you can browse sample camps but not save changes.`;
const DEMO_BANNER = `Showing sample camps. ${NO_DB}, so you can browse but not save changes.`;
app.use((req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  res.locals.demoBanner = DEMO_BANNER;
  const reading = req.method === "GET" || req.method === "HEAD";
  if (reading && /^\/camps\/?$/.test(req.path)) {
    const params = parseListQuery(req.query);
    return renderCampList(res, params, listDemoCamps(demoCamps, params));
  }
  const m = req.path.match(/^\/camps\/([^/]+)$/);
  if (reading && m && m[1] !== "new") {
    const camp = demoCamps.find((c) => c._id === m[1]);
    if (camp) return res.render("camps/show", { camp });
    return next(new ExpressError("Page not found", 404));
  }
  if (!reading) {
    return res.status(503).render("error", {
      status: 503,
      title: "Changes can't be saved right now",
      message: OUTAGE_MSG,
    });
  }
  return next();
});

app.use("/", userRoutes);
app.use("/camps", campsRoutes);
app.use("/camps/:id/reviews", reviewRoutes);

app.get("/", (req, res) => {
  res.render("home");
});

app.get("/credits", (req, res) => {
  res.render("credits", { credits: require("./utils/credits") });
});

app.all("*", (req, res, next) => {
  next(new ExpressError("Page not found", 404));
});

// Users see a plain message, never a database or library error text. The
// stack trace is shown only in local development.
const ERROR_PAGES = {
  404: {
    title: "Page not found",
    message:
      "There's no page at this address. The link may be wrong, or the page may have been removed.",
  },
  500: {
    title: "Something went wrong",
    message: "We couldn't load this page. Please try again in a minute.",
  },
};
app.use((err, req, res, _next) => {
  let status = err.statusCode || err.status || 500;
  if (err.name === "CastError") status = 404;
  let page = ERROR_PAGES[status];
  if (!page) {
    const ownMessage = (err instanceof ExpressError || (status < 500 && err.expose)) && err.message;
    page = ownMessage ? { title: err.message, message: "" } : ERROR_PAGES[500];
  }
  if (status >= 500) console.error(err);
  const stack = process.env.NODE_ENV === "development" && status >= 500 ? err.stack : "";
  res.status(status).render("error", { status, ...page, stack });
});

const port = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Serving on port ${port}`);
  });
}

module.exports = app;
