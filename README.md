# NZ Camps

A campground review platform for New Zealand: create an account, add campgrounds with photos
and map locations, and leave reviews.

**Live:** https://nz-camps.vercel.app

## Stack

- Node.js / Express, server-rendered with EJS
- MongoDB Atlas via mongoose 8 (sessions stored in Mongo)
- Passport (local strategy) authentication
- Location geocoding (OpenCage when configured, OpenStreetMap Nominatim fallback)
- Image uploads via Cloudinary when configured, with a serverless-safe embedded fallback
- Deployed serverless on Vercel

## Local development

```bash
npm install
DB_URL=<mongodb-connection-string> node index.js
```

Optional env: `SECRET` (sessions), `OPENCAGE_ACCESS_TOKEN` (geocoding),
`CLOUDINARY_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_SECRET` (image hosting),
`BASE_URL`. Without `DB_URL` the site runs in a read-only demo mode.

Seed sample data: `DB_URL=... node seeds/seedAtlas.js`
