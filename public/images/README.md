# Images

Photo credits for every photo on the site, with the location each Unsplash page gives: [CREDITS.md](CREDITS.md).

| File | Source |
|---|---|
| `auth-ferns-480.jpg`, `auth-ferns-960.jpg` | Cropped and resized from `public/stylesheets/harry-knight-mqpY5vyNrKE-unsplash.jpg` (photo by Harry Knight on Unsplash, id `mqpY5vyNrKE`). Used on the log in and sign up cards. |
| `samples/*.jpg` | Sample listing photos from Unsplash, 1600 px wide. See CREDITS.md. |
| `<name>-<width>.avif`, `<name>-<width>.jpg` | Responsive variants made by `npm run images` (`scripts/images.js`, ImageMagick with AVIF): every sample photo at 480, 800, 1200 and 1600 or 1920 px as AVIF, with JPEG fallbacks at 800 and 1200 px. `utils/images.json` lists them for the templates. The originals keep their addresses. |
| `home-hero-*`, `home-hero-wide-*` | The home page photo (Robert Koorenny), as a portrait crop for phones and a 16:10 crop for wider screens. |
| `backdrop-tall-720.*` | A tall crop of the page background (Mitchell Luo) for phones. |
| `auth-ferns-*.avif` | AVIF copies of the log in card photo. |
| `og-nzcamps.jpg` | The 1200 x 630 social card: a crop of the home page photo with the site title. |
| `icon.svg`, `apple-touch-icon.png`, `pin.svg`, `star-*.svg`, `no-photo.svg` | Drawn for the site: the tent mark, the map pin, rating stars and the no-photo placeholder. |
