# NZ Camps

A campground directory and review site for New Zealand, built with Node.js, Express, EJS and MongoDB.

My own project: built in 2021, modernised in 2026.

**Live demo:** [nz-camps.vercel.app](https://nz-camps.vercel.app/)

![The camps list on a desktop screen: search and sort, sample camps with photos, prices and a Sample listing badge, and beside them a map of New Zealand with camp pins](docs/camps-list-desktop.webp)

<p>
  <img src="docs/screenshot.webp" alt="The NZ Camps home page: the title New Zealand Camps over a gravel path through native bush, with a View Camps button and a Sign up to add a camp link" width="560" />
  <img src="docs/camp-page-phone.webp" alt="A sample camp page on a phone: the camp name, place, price, a Sample listing badge and its photo with a credit line" width="180" />
</p>

## What it is

Visitors can browse campgrounds on a clustered map of New Zealand and read reviews. Signed-in users can add their own camps with photos and a location, edit or delete the camps they created, and leave star-rated reviews on any camp.

## Features

- **Accounts:** register, log in and log out with Passport 0.7 (local strategy, via `passport-local-mongoose`). Failed logins slow down with a back-off stored on the account. When a database is connected, sessions are stored in MongoDB with `connect-mongo`; anonymous visits store no session.
- **Camps:** create, edit and delete campgrounds (title, price per night, location, description, photos); the edit form can add photos or remove them. Only the camp's creator can edit or delete it.
- **Photo uploads:** up to three JPG, PNG or WebP photos of up to 1.4 MB each per form (six per camp), checked by their content as well as the declared type. The browser shrinks large photos before sending them, and the server strips location and camera details from JPEGs. Photos go to Cloudinary when it is set up, otherwise into the camp document as data URIs, so uploads work on serverless hosting with no writable disk.
- **Geocoding:** the location text is turned into coordinates, with ", New Zealand" added to the search. Uses OpenCage when a token is set, otherwise the keyless OpenStreetMap Nominatim API; both are restricted to New Zealand results and give up after 5 seconds.
- **Maps:** the camps page shows every matching camp on a Leaflet map with marker clustering, fitted to the markers; on desktop the map sits beside the list, on phones a List | Map toggle swaps them. Each camp page has its own map with a marker.
- **Reviews:** 1 to 5 star ratings with a written review. Reviewers can delete their own reviews, and deleting a camp removes its reviews.
- **Validation:** Joi schemas (and matching Mongoose limits) check camp, review and sign-up input on the server; a form that fails comes back with what was typed and a list of problems. The browser runs the same checks first with the same messages, and `express-mongo-sanitize` strips MongoDB operators from request data.
- **Security:** a strict content security policy (no inline scripts or styles, front-end libraries served from this site), a cross-site form check, `HttpOnly`/`SameSite`/`Secure` session cookies and POST-only logout. Page data for the maps is written as escaped JSON and map popups are built from text, never HTML.
- **Sample listings:** eight invented camps at real places across both islands, labelled "Sample listing" wherever they appear; every page footer explains the label. Each has an Unsplash photo of the area it is listed in, with alt text and a credit line. There are no sample reviews.
- **Pages and photos:** responsive from 320 px wide, with one design system on Bootstrap 5.3 (`public/stylesheets/tokens.css`). Photos are served as AVIF (with JPEG fallbacks) at the width each slot needs, made by `npm run images`, so a phone loads a photo sized for its screen instead of the original multi-megabyte file. Every page has its own title and description, a social card image, a skip link, a visible focus ring on every control, controls at least 44 px (links inside a sentence aside), and no motion when reduced motion is set.
- **Demo mode:** if `DB_URL` is not set, or the database cannot be reached within 5 seconds, the camps list (with search, sort and pages) and the eight sample camp pages render from `seeds/demoData.js`. Every page shows a banner saying so, and form submissions get a page explaining that nothing can be saved.

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
- Tests: Node's test runner, Supertest and an in-memory MongoDB; Playwright and axe-core in Chrome; ESLint and Prettier

## Running it locally

Use Node.js 22, the version set in `engines` in `package.json` (`nvm use` picks it up from `.nvmrc`).

```bash
npm install
npm start
```

Then open http://localhost:3000. With no database configured it starts in demo mode.

Unless `NODE_ENV` is `production` or `test`, settings are read from a `.env` file in the project root with Node's built-in loader (variables already set win). `.env.example` lists every variable with a placeholder; copy it with `cp .env.example .env`. It points `DB_URL` at a local MongoDB; leave `DB_URL` empty to run in demo mode. The app reads:

| Variable | Purpose |
| --- | --- |
| `DB_URL` | MongoDB connection string. Without it the app runs in demo mode. |
| `SECRET` | Session signing secret. If it is missing in production the app logs an error on every cold start and uses a server-side fallback, so always set it. |
| `OPENCAGE_ACCESS_TOKEN` | Optional. Use OpenCage for geocoding instead of Nominatim. |
| `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET` | Optional. All three are needed to store uploads on Cloudinary. |
| `BASE_URL` | Optional public address, used only for absolute URLs (the canonical link). Navigation links are always relative. |
| `PORT` | Port to listen on. Defaults to 3000. |
| `NODE_ENV` | `production` on Vercel. Any value other than `production` or `test` loads `.env`; `development` (as in `.env.example`) also shows stack traces on server error pages. |

### Seeding the database

`seeds/seedAtlas.js` copies the eight sample camps into a database, labelled as samples. It skips any camp whose title already exists, and creates a `ranger` user as the author if there isn't one. The script does not load `.env`, so pass the variables on the command line. A database that is not on your machine also needs `CONFIRM_REMOTE=yes`:

```bash
DB_URL=mongodb://127.0.0.1:27017/nzcamps node seeds/seedAtlas.js
```

Set `SEED_PASSWORD` to choose the `ranger` user's password; otherwise a random one is made and printed once.

`seeds/labelDemo.js` flags camps added by `ranger` in an existing database as samples (`isDemo`), and with `--photos` gives the sample camps the current credited photos. It is a dry run unless you add `--apply`, has the same `CONFIRM_REMOTE` guard, and prints only counts and a masked host:

```bash
DB_URL=mongodb://127.0.0.1:27017/nzcamps node seeds/labelDemo.js --photos          # dry run
DB_URL=mongodb://127.0.0.1:27017/nzcamps node seeds/labelDemo.js --photos --apply
```

### Tests and checks

```bash
npm test               # integration tests against an in-memory MongoDB (no network)
npm run test:coverage  # the same, with a line and branch coverage table
npm run test:e2e       # end-to-end and accessibility tests in Chrome (Playwright)
npm run lint           # ESLint
npm run format:check   # Prettier
npm run check:bundle   # trace the Vercel function and run the tests against that copy
npm run vendor         # re-copy the pinned Leaflet and Bootstrap files into public/vendor
npm run images         # remake the AVIF and JPEG photo variants (needs ImageMagick with AVIF)
```

**`npm test`** runs the tests in `test/*.test.js` with Node's built-in runner and Supertest, each file against its own in-memory MongoDB (`mongodb-memory-server`, pinned to MongoDB 8.2.6 in `package.json`; the binary is fetched on first use and cached in `~/.cache/mongodb-binaries`, never at install time). A guard in `test/helpers/guard.js` makes any request that leaves the machine fail, so the geocoder, Cloudinary and real databases are never reached, and an unhandled rejection fails the run.

They cover accounts and sessions, camp and review create, edit and delete with ownership checks, search, sort and pages, uploads, demo mode and reconnecting, the seed scripts, error pages, the page markup the design relies on, and `test/security.test.js`, where each test is named after the hole it guards (personal data in pages, stored script injection, photo ownership, cookies and sessions, cross-site form posts, security headers, upload types, operator-shaped form input). `npm run test:coverage` prints line and branch coverage for each file.

**`npm run test:e2e`** runs the specs in `e2e/` with Playwright, at 390 px (a phone) and 1440 px. It starts two local servers by itself (`e2e/server.js`: one on an in-memory MongoDB with the sample camps and a few test camps, on port 7203, and one in demo mode on 7206) and stops them at the end. It uses the browser in `CHROME_PATH` if that is set, otherwise Chrome at `/usr/bin/google-chrome`; without either, install Playwright's Chromium once with `npx playwright install chromium`. Map tiles are answered with a local image, so the run needs no network and never loads the public tile servers.

- `journey.spec.js`: home to the list with every camp on the map, search, page 2, and a member's journey: sign up, add a camp with a large photo (shrunk to 1600 px in the browser), review it, move it and see the pin move, add and remove photos, delete the review and the camp, log out; and the error summaries on the add-camp and review forms, which open below the sticky header and lose each line as its field is fixed.
- `security.spec.js`: a camp whose name, place, description and review are script-shaped stays plain text on the list, its own page and both map popups.
- `demo.spec.js`: demo mode shows the banner and the eight sample camps, and a log in gets a plain "can't be saved" page.
- `a11y.spec.js`: axe-core's WCAG 2.0, 2.1 and 2.2 A and AA rule sets on every page state (signed in and out, forms with errors, 404, demo mode) must find nothing; every control is at least 44 x 44 px (links inside a sentence aside); nothing scrolls sideways at 320 px; the maps and the photo carousel do not animate with reduced motion.
- `keyboard.spec.js`: the main journey with the keyboard alone, and a Tab pass over the main pages checking that every control shows the focus outline.
- `guard.spec.js`: every page in every spec is watched for console errors, script errors, content security policy violations, failed requests and sideways scrolling; this spec causes each of those on purpose to prove they are caught.

Results go to `test-results/` (not committed): failure traces and screenshots, and the accessibility results as JSON in `test-results/a11y/`.

## Deployment

`vercel.json` rewrites every request to `api/index.js`, which exports the Express app from `index.js`. `index.js` only calls `app.listen` when run directly, so the same code serves both `npm start` and Vercel. On a cold start, requests wait for the MongoDB connection (up to 5 seconds) before falling back to demo content; a failed connection is retried on the request path (no timers, since a frozen function runs none) at most every 30 seconds. Photos stored as data URIs (when Cloudinary is not set up) are served from their own address, `/camps/<id>/images/<photo id>`, with a long cache lifetime, instead of being written into the pages. Three photos of up to 1.4 MB keep a form under Vercel's 4.5 MB request body limit. The function bundle holds the traced code plus `views/`; `public/` is served by Vercel's CDN, and `public/vendor/` is cached for a year.

## History

I started it in July 2021, originally using Mapbox for maps and geocoding and hosted on Heroku. In January 2025 the maps moved to Leaflet with OpenStreetMap tiles and geocoding moved to OpenCage. In June 2026 I upgraded it to Mongoose 8 and redeployed it as a serverless function on Vercel. In October 2026 I closed security holes (email addresses in the page source, script injection through camp text, session and upload handling), labelled the sample listings, rebuilt the pages for phones, keyboards and screen readers, and added the tests described above.

## Project structure

```
index.js              Express app: sessions, auth, demo mode, routes, error handling
api/index.js          Vercel entry point (re-exports the app)
routes/               camps, reviews and user routes
controllers/          route handlers
models/               Camp, Review and User (Mongoose)
schemas.js            Joi validation schemas
cloudinary/           photo uploads: limits, content checks, Cloudinary or data URIs
utils/                route middleware (login, ownership and validation checks), geocoding,
                      sessions, security headers, view helpers, errors
seeds/                sample camps, the seeder and the labelling script
views/                EJS templates
public/               stylesheets, images, browser scripts and vendored libraries
scripts/              bundle check, vendoring and image scripts
test/                 integration tests and their helpers
e2e/                  Playwright specs, their local server and fixtures
playwright.config.js  browsers, widths and the two local test servers
docs/                 README screenshots
.env.example          every environment variable, with placeholders
```

Every photo on the site is from Unsplash; [public/images/CREDITS.md](public/images/CREDITS.md) and the site's /credits page credit each one.

## Trade-offs and what's next

- Without Cloudinary, photos are stored inside the camp document. That keeps serverless hosting simple, but the database grows quickly; set up Cloudinary for real use.
- Search matches the camp name and place with a regular expression. That is fine for a small directory; a large one would need a text index.
- Geocoding falls back to the free Nominatim API, and the maps use OpenStreetMap's public tiles. Both are meant for light traffic; OpenCage and a commercial tile provider are the options for more.
- Reviews can be deleted but not edited, and there is no password reset or email confirmation yet.
- The tests run locally; there is no CI workflow in the repo yet.

## Author

Built by Daniel Olliver. More of my work: [danielolliver.com/dev](https://danielolliver.com/dev/).

I also run [Olliver Web](https://olliverweb.co.nz), my web design and development service in Auckland for small-business websites, online stores and web apps.

Licence: ISC (see [LICENSE](LICENSE)).
