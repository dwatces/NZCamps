# NZ Camps

A campground directory and review site for New Zealand, built with Node.js, Express, EJS and MongoDB.

**Live demo:** [nz-camps.vercel.app](https://nz-camps.vercel.app/)

![NZ Camps home page](docs/screenshot.webp)

## What it is

Visitors can browse campgrounds on a clustered map of New Zealand and read reviews. Signed-in users can add their own camps with photos and a location, edit or delete the camps they created, and leave star-rated reviews on any camp.

I started it in July 2021 as a learning project, originally using Mapbox for maps and geocoding and hosted on Heroku. In January 2025 the maps moved to Leaflet with OpenStreetMap tiles and geocoding moved to OpenCage. In June 2026 I upgraded it to Mongoose 8 and redeployed it as a serverless function on Vercel.

## Features

- **Accounts:** register, log in and log out with Passport (local strategy, via `passport-local-mongoose`). When a database is configured, sessions are stored in MongoDB with `connect-mongo`.
- **Camps:** create, edit and delete campgrounds (title, price per night, location, description, photos). Only the camp's creator can edit or delete it.
- **Photo uploads:** several images per camp, up to 3 MB each. With Cloudinary credentials set, uploads go to Cloudinary. Without them, images are stored in the camp document as data URIs, so uploads still work on serverless hosting with no writable disk. The edit form can add more photos or remove existing ones.
- **Geocoding:** the location text is turned into coordinates, with ", New Zealand" added to the search. Uses OpenCage when a token is set, otherwise the keyless OpenStreetMap Nominatim API, which is also restricted to New Zealand results.
- **Maps:** the camps page shows every camp on a Leaflet map with marker clustering; each camp page has its own map with a marker.
- **Reviews:** 1 to 5 star ratings with a written review. Reviewers can delete their own reviews, and deleting a camp removes its reviews.
- **Validation:** Joi schemas check camp and review input on the server, Bootstrap validation runs in the browser, and `express-mongo-sanitize` strips MongoDB operators from request data.
- **Demo mode:** if `DB_URL` is not set, or the database cannot be reached within 8 seconds, the camps list and three sample camp pages render from `seeds/demoData.js`, and form submissions show a notice instead of saving.

## Tech stack

- Node.js 22, Express 4
- EJS with `ejs-mate` layouts, Bootstrap 5
- MongoDB (Atlas) with Mongoose 8
- Passport, `express-session`, `connect-mongo`, `connect-flash`
- Multer, Cloudinary (`multer-storage-cloudinary`)
- Leaflet, Leaflet.markercluster, OpenStreetMap tiles
- OpenCage or Nominatim for geocoding
- Joi, `express-mongo-sanitize`, `method-override`
- Vercel (one serverless function)

## Running it locally

Use Node.js 22, the version set in `engines` in `package.json`.

```bash
npm install
npm start
```

Then open http://localhost:3000. With no database configured it starts in demo mode.

When `NODE_ENV` is not `production`, settings are read from a `.env` file in the project root via `dotenv`. The app reads these environment variables:

| Variable | Purpose |
| --- | --- |
| `DB_URL` | MongoDB connection string. Without it the app runs in demo mode. |
| `SECRET` | Session signing secret. The code falls back to a placeholder if it is unset, so always set it outside local testing. |
| `OPENCAGE_ACCESS_TOKEN` | Optional. Use OpenCage for geocoding instead of Nominatim. |
| `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET` | Optional. All three are needed to store uploads on Cloudinary. |
| `BASE_URL` | Optional prefix for the Register, Login and New Camp buttons on the camps page. |
| `PORT` | Port to listen on. Defaults to 3000. |
| `NODE_ENV` | When not `production`, `.env` is loaded and error pages show stack traces. |

### Seeding the database

`seeds/seedAtlas.js` copies the three sample camps into a real database. It skips any camp whose title already exists, and creates a `ranger` user as the author if there isn't one. The script does not load `.env`, so pass the variables on the command line:

```bash
DB_URL=<your-connection-string> node seeds/seedAtlas.js
```

Set `SEED_PASSWORD` to choose the `ranger` user's password; otherwise a random one is generated and printed once.

There are no automated tests (`npm test` is the npm placeholder).

## Deployment

`vercel.json` rewrites every request to `api/index.js`, which exports the Express app from `index.js`. `index.js` only calls `app.listen` when run directly, so the same code serves both `npm start` and Vercel. On a cold start, requests wait for the MongoDB connection (up to 8 seconds) before falling back to demo content.

## Project structure

```
index.js          Express app: sessions, auth, demo mode, routes, error handling
api/index.js      Vercel entry point (re-exports the app)
routes/           camps, reviews and user routes
controllers/      route handlers
models/           Camp, Review and User (Mongoose)
middleware.js     login, ownership and validation checks
schemas.js        Joi validation schemas
cloudinary/       upload storage (Cloudinary or in-memory) and image helpers
utils/            geocoding, async error wrapper, error class
seeds/            demo camps and the database seeder
views/            EJS templates
public/           stylesheets, images and browser scripts (maps, form validation)
```

The background and sample camp photos in `public/stylesheets/` are from Unsplash; the photographers' names are in the file names.

## Author

Built by Daniel Olliver. More of my work: [danielolliver.com/dev](https://danielolliver.com/dev/).

I also run [Olliver Web](https://olliverweb.co.nz), a web design and development studio in Auckland.
