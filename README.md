# NZ Camps

A campground directory and review site for New Zealand, built with Node.js, Express, EJS and MongoDB.

**Live demo:** [nz-camps.vercel.app](https://nz-camps.vercel.app/)

![NZ Camps home page](docs/screenshot.webp)

## What it is

Visitors can browse campgrounds on a clustered map of New Zealand and read reviews. Signed-in users can add their own camps with photos and a location, edit or delete the camps they created, and leave star-rated reviews on any camp.

I started it in July 2021 as a learning project, originally using Mapbox for maps and geocoding and hosted on Heroku. In January 2025 the maps moved to Leaflet with OpenStreetMap tiles and geocoding moved to OpenCage. In June 2026 I upgraded it to Mongoose 8 and redeployed it as a serverless function on Vercel.

## Features

- **Accounts:** register, log in and log out with Passport 0.7 (local strategy, via `passport-local-mongoose`). Failed logins slow down with a back-off stored on the account. When a database is connected, sessions are stored in MongoDB with `connect-mongo` on Mongoose's own connection; anonymous visits store no session.
- **Camps:** create, edit and delete campgrounds (title, price per night, location, description, photos). Only the camp's creator can edit or delete it.
- **Photo uploads:** up to three JPG, PNG or WebP photos of up to 1.4 MB each per form, checked by their content, not the declared type. With Cloudinary credentials set, uploads go to Cloudinary, and only after the rest of the form has passed its checks. Without them, images are stored in the camp document as data URIs, so uploads still work on serverless hosting with no writable disk. The edit form can add more photos or remove existing ones.
- **Geocoding:** the location text is turned into coordinates, with ", New Zealand" added to the search. Uses OpenCage when a token is set, otherwise the keyless OpenStreetMap Nominatim API; both are restricted to New Zealand results and give up after 5 seconds.
- **Maps:** the camps page shows every camp on a Leaflet map with marker clustering; each camp page has its own map with a marker.
- **Reviews:** 1 to 5 star ratings with a written review. Reviewers can delete their own reviews, and deleting a camp removes its reviews.
- **Validation:** Joi schemas (and matching Mongoose limits) check camp, review and sign-up input on the server; a form that fails comes back with what was typed and a list of problems. Bootstrap validation runs in the browser, and `express-mongo-sanitize` strips MongoDB operators from request data.
- **Security:** a strict content security policy (no inline scripts or styles, front-end libraries served from this site), a cross-site form check, `HttpOnly`/`SameSite`/`Secure` session cookies and POST-only logout. Page data for the maps is written as escaped JSON and map popups are built from text, never HTML.
- **Sample listings:** eight invented camps at real places across both islands, labelled "Sample listing" wherever they appear; every page footer explains the label. Their photos are from Unsplash, each of the area it is listed in, with alt text and a credit line ([public/images/CREDITS.md](public/images/CREDITS.md)). There are no sample reviews.
- **Demo mode:** if `DB_URL` is not set, or the database cannot be reached within 5 seconds, the camps list and the eight sample camp pages render from `seeds/demoData.js`, and form submissions show a notice instead of saving.

## Tech stack

- Node.js 22, Express 4
- EJS with `ejs-mate` layouts, Bootstrap 5.3
- MongoDB (Atlas) with Mongoose 8
- Passport 0.7, `express-session`, `connect-mongo`, `connect-flash`
- Multer 2, Cloudinary 2
- Leaflet 1.9, Leaflet.markercluster, OpenStreetMap tiles
- OpenCage or Nominatim for geocoding
- Joi, Helmet, `express-mongo-sanitize`, `method-override`
- Vercel (one serverless function)
- Tests: Node's test runner, Supertest and an in-memory MongoDB; ESLint and Prettier

## Running it locally

Use Node.js 22, the version set in `engines` in `package.json`.

```bash
npm install
npm start
```

Then open http://localhost:3000. With no database configured it starts in demo mode.

When `NODE_ENV` is not `production`, settings are read from a `.env` file in the project root with Node's built-in loader (variables already set win). `.env.example` lists every variable with a placeholder; copy it to `.env`. The app reads:

| Variable | Purpose |
| --- | --- |
| `DB_URL` | MongoDB connection string. Without it the app runs in demo mode. |
| `SECRET` | Session signing secret. If it is missing in production the app logs an error on every cold start and uses a server-side fallback, so always set it. |
| `OPENCAGE_ACCESS_TOKEN` | Optional. Use OpenCage for geocoding instead of Nominatim. |
| `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET` | Optional. All three are needed to store uploads on Cloudinary. |
| `BASE_URL` | Optional public address, used only for absolute URLs (the canonical link). Navigation links are always relative. |
| `PORT` | Port to listen on. Defaults to 3000. |
| `NODE_ENV` | When not `production`, `.env` is loaded and error pages show stack traces. |

### Seeding the database

`seeds/seedAtlas.js` copies the eight sample camps into a database, labelled as samples. It skips any camp whose title already exists, and creates a `ranger` user as the author if there isn't one. The script does not load `.env`, so pass the variables on the command line. A database that is not on your machine also needs `CONFIRM_REMOTE=yes`:

```bash
DB_URL=mongodb://127.0.0.1:27017/nzcamps node seeds/seedAtlas.js
```

Set `SEED_PASSWORD` to choose the `ranger` user's password; otherwise a random one is generated and printed once.

`seeds/labelDemo.js` flags camps added by `ranger` in an existing database as samples (`isDemo`), and with `--photos` gives the sample camps the current credited photos. It is a dry run unless you add `--apply`, has the same `CONFIRM_REMOTE` guard, and prints only counts and a masked host:

```bash
DB_URL=mongodb://127.0.0.1:27017/nzcamps node seeds/labelDemo.js --photos          # dry run
DB_URL=mongodb://127.0.0.1:27017/nzcamps node seeds/labelDemo.js --photos --apply
```

### Tests and checks

```bash
npm test              # integration tests against an in-memory MongoDB (no network)
npm run lint          # ESLint
npm run format:check  # Prettier
npm run check:bundle  # trace the Vercel function and run the tests against that copy
npm run vendor        # re-copy the pinned Leaflet and Bootstrap files into public/vendor
```

The tests download nothing at install time: `mongodb-memory-server` is pinned to MongoDB 8.2.6 in `package.json` and fetches the binary on first use (cached in `~/.cache/mongodb-binaries`).

## Deployment

`vercel.json` rewrites every request to `api/index.js`, which exports the Express app from `index.js`. `index.js` only calls `app.listen` when run directly, so the same code serves both `npm start` and Vercel. On a cold start, requests wait for the MongoDB connection (up to 5 seconds) before falling back to demo content. The function bundle holds the traced code plus `views/`; `public/` is served by Vercel's CDN, and `public/vendor/` is cached for a year.

## Project structure

```
index.js          Express app: sessions, auth, demo mode, routes, error handling
api/index.js      Vercel entry point (re-exports the app)
routes/           camps, reviews and user routes
controllers/      route handlers
models/           Camp, Review and User (Mongoose)
middleware.js     login, ownership and validation checks
schemas.js        Joi validation schemas
cloudinary/       photo uploads: limits, content checks, Cloudinary or data URIs
utils/            geocoding, sessions, security headers, view helpers, errors
seeds/            sample camps and the database seeder
views/            EJS templates
public/           stylesheets, images, browser scripts and vendored libraries
scripts/          bundle check and vendoring scripts
test/             integration tests and their helpers
```

All photos are from Unsplash; [public/images/CREDITS.md](public/images/CREDITS.md) lists each photographer, its Unsplash page and the location that page gives.

## Author

Built by Daniel Olliver. More of my work: [danielolliver.com/dev](https://danielolliver.com/dev/).

I also run [Olliver Web](https://olliverweb.co.nz), a web design and development studio in Auckland.
