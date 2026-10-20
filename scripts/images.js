// Responsive image variants for NZ Camps.
//
// Usage: npm run images   (then commit public/images/ and utils/images.json)
//
// Needs ImageMagick 6.9 or 7 built with AVIF support (libheif); check with
// `convert -list format | grep AVIF`. It is a maintainer script only: it is
// never a build, prepare or postinstall step, so Vercel never runs it.
//
// Every page photo gets AVIF variants at the standard widths and a JPEG
// fallback (this ImageMagick build ignores the WebP quality setting, and its
// WebP files came out larger than the equivalent JPEGs, so there is no WebP).
// The original files keep their addresses: camps in the live database point
// at the /stylesheets/*.jpg paths.
//
// Outputs:
// - public/images/<name>-<width>.avif and .jpg for every sample photo
// - the home hero in a portrait crop (phones) and a wide crop
// - a tall crop of the page background for phones
// - the log in card photo
// - og-nzcamps.jpg, the 1200 x 630 social card
// - apple-touch-icon.png from icon.svg
// - utils/images.json, the manifest the templates read (through require, so
//   the Vercel function bundle traces it)
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { PHOTOS } = require("../utils/samplePhotos");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const OUT = path.join(PUBLIC, "images");
const MANIFEST = path.join(ROOT, "utils", "images.json");
const FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf";
const FONT_REGULAR = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf";

const STANDARD_WIDTHS = [480, 800, 1200, 1920];
const JPEG_WIDTHS = [800, 1200];
// AVIF quality by width: small files tolerate less compression.
const avifQuality = (w) => (w <= 480 ? 50 : w <= 800 ? 45 : w <= 1200 ? 40 : 36);

const convert = (args) => execFileSync("convert", args, { stdio: ["ignore", "ignore", "inherit"] });
const size = (file) => {
  const out = execFileSync("identify", ["-format", "%w %h", `${file}[0]`], { encoding: "utf8" });
  const [w, h] = out.trim().split(" ").map(Number);
  return { w, h };
};
const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)} KB`;

function checkImageMagick() {
  let formats;
  try {
    formats = execFileSync("convert", ["-list", "format"], { encoding: "utf8" });
  } catch {
    throw new Error("ImageMagick's convert was not found.");
  }
  if (!/^\s*AVIF\*?\s+(\S+\s+)?rw/m.test(formats)) {
    throw new Error("This ImageMagick cannot write AVIF (it needs libheif).");
  }
  for (const font of [FONT_BOLD, FONT_REGULAR]) {
    if (!fs.existsSync(font)) throw new Error(`Font not found: ${font} (used for the social card)`);
  }
}

// Widths to make for a source of width `w`: the standard widths below it,
// plus the source width itself (capped at the largest standard width).
function widthsFor(w, candidates = STANDARD_WIDTHS) {
  const top = Math.min(w, candidates[candidates.length - 1]);
  const list = candidates.filter((c) => c < top);
  list.push(top);
  return list;
}

// One variant. `prep` is a list of ImageMagick operators applied before the
// resize (a crop, for example).
function variant(src, name, width, ext, prep = [], quality = avifQuality) {
  const file = path.join(OUT, `${name}-${width}.${ext}`);
  const encode =
    ext === "avif"
      ? ["-quality", String(quality(width))]
      : ["-sampling-factor", "4:2:0", "-interlace", "Plane", "-quality", "72"];
  convert([src, "-auto-orient", ...prep, "-strip", "-resize", `${width}x`, ...encode, file]);
  return file;
}

function photoSet(
  src,
  name,
  { prep = [], widths, jpegWidths = JPEG_WIDTHS, sourceSize, quality } = {},
) {
  const { w, h } = sourceSize || size(src);
  const avif = widths || widthsFor(w);
  const jpeg = jpegWidths.filter((jw) => jw <= avif[avif.length - 1]);
  for (const width of avif) variant(src, name, width, "avif", prep, quality);
  for (const width of jpeg) variant(src, name, width, "jpg", prep);
  const largest = path.join(OUT, `${name}-${avif[avif.length - 1]}.avif`);
  console.log(`${name}: avif ${avif.join("/")} (largest ${kb(largest)}), jpg ${jpeg.join("/")}`);
  return { name: `/images/${name}`, width: w, height: h, avif, jpeg };
}

// Crop geometry for a centred box of the given aspect ratio, with its centre
// at `yCentre` (0 to 1) of the source height.
function cropBox({ w, h }, aspect, yCentre = 0.5) {
  if (w / h > aspect) {
    const cw = Math.round(h * aspect);
    return { w: cw, h, x: Math.round((w - cw) / 2), y: 0 };
  }
  const ch = Math.round(w / aspect);
  const y = Math.min(h - ch, Math.max(0, Math.round(h * yCentre - ch / 2)));
  return { w, h: ch, x: 0, y };
}
const cropArgs = (b) => ["-crop", `${b.w}x${b.h}+${b.x}+${b.y}`, "+repage"];

function main() {
  checkImageMagick();
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = { photos: {}, hero: {}, backdrop: {}, auth: null, og: null };

  // Sample listing photos (also the page background, which is one of them).
  for (const p of PHOTOS) {
    const src = path.join(PUBLIC, p.url);
    const name = path.basename(p.url, ".jpg").replace(/-[A-Za-z0-9_-]{11}(-unsplash)?$/, "");
    manifest.photos[p.url] = photoSet(src, name);
  }

  // Home hero: the gravel path photo. Portrait for phones, a wide crop for
  // larger screens, centred a little below the middle to keep the path.
  const heroSrc = path.join(PUBLIC, "stylesheets", "robert-koorenny-Py2ULdPgHac-unsplash.jpg");
  const hero = size(heroSrc);
  manifest.hero.portrait = photoSet(heroSrc, "home-hero", {
    widths: [480, 800, 1200],
    jpegWidths: [800],
    sourceSize: hero,
    // Foliage is expensive to encode; the hero sits under a dark overlay,
    // so it takes more compression to stay inside the phone page budget.
    quality: (w) => (w <= 480 ? 45 : w <= 800 ? 38 : 30),
  });
  const wide = cropBox(hero, 16 / 10, 0.55);
  manifest.hero.wide = photoSet(heroSrc, "home-hero-wide", {
    prep: cropArgs(wide),
    widths: [1200, 1920],
    jpegWidths: [1200],
    sourceSize: { w: wide.w, h: wide.h },
  });

  // Page background on phones: a tall crop, so a narrow screen is not
  // showing a few hundred pixels of a wide photo blown up.
  const bgSrc = path.join(PUBLIC, "stylesheets", "mitchell-luo-CEowgw6VXbE-unsplash.jpg");
  const tall = cropBox(size(bgSrc), 9 / 16, 0.5);
  manifest.backdrop.tall = photoSet(bgSrc, "backdrop-tall", {
    prep: cropArgs(tall),
    widths: [tall.w],
    jpegWidths: [tall.w],
    sourceSize: { w: tall.w, h: tall.h },
  });
  manifest.backdrop.wide = manifest.photos["/stylesheets/mitchell-luo-CEowgw6VXbE-unsplash.jpg"];

  // Log in and sign up card: the fern crop made in the foundation stage.
  // Its two JPEGs (480 and 960) are that stage's files and are kept as they
  // are; only the AVIF versions are made here.
  manifest.auth = photoSet(path.join(OUT, "auth-ferns-960.jpg"), "auth-ferns", {
    widths: [480, 960],
    jpegWidths: [],
  });
  manifest.auth.jpeg = [480, 960];

  // Social card: the hero's path, darkened on the left behind the title.
  const og = path.join(OUT, "og-nzcamps.jpg");
  const ogBox = cropBox(hero, 1200 / 630, 0.58);
  convert([
    heroSrc,
    "-auto-orient",
    ...cropArgs(ogBox),
    "-strip",
    "-resize",
    "1200x630!",
    "(",
    "-size",
    "630x1200",
    "gradient:rgba(5,12,8,0.86)-rgba(5,12,8,0.25)",
    "-rotate",
    "-90",
    ")",
    "-composite",
    "-fill",
    "#ffffff",
    "-font",
    FONT_BOLD,
    "-pointsize",
    "76",
    "-annotate",
    "+72+300",
    "New Zealand Camps",
    "-font",
    FONT_REGULAR,
    "-pointsize",
    "34",
    "-fill",
    "#e4f3ea",
    "-annotate",
    "+76+366",
    "Find and review campgrounds around Aotearoa",
    "-fill",
    "#18a558",
    "-draw",
    "rectangle 76,404 196,410",
    "-sampling-factor",
    "4:2:0",
    "-interlace",
    "Plane",
    "-quality",
    "80",
    og,
  ]);
  console.log(`og-nzcamps.jpg: ${kb(og)}`);
  manifest.og = { url: "/images/og-nzcamps.jpg", width: 1200, height: 630 };

  // Home screen icon for iOS (the SVG favicon covers other browsers): the
  // tent from icon.svg, drawn at 180 px (ImageMagick's own SVG renderer is
  // too rough for this), square because iOS rounds the corners itself.
  const touch = path.join(OUT, "apple-touch-icon.png");
  const at = (n) => (n * 180) / 32;
  const pts = (list) => list.map(([x, y]) => `${at(x)},${at(y)}`).join(" ");
  convert([
    "-size",
    "180x180",
    "xc:#116530",
    "-fill",
    "none",
    "-stroke",
    "#ffffff",
    "-strokewidth",
    String(at(2.2)),
    "-draw",
    `stroke-linecap round stroke-linejoin round polyline ${pts([
      [6.5, 24],
      [16, 8],
      [25.5, 24],
    ])}`,
    "-draw",
    `stroke-linecap round stroke-linejoin round polyline ${pts([
      [12.5, 24],
      [16, 17.5],
      [19.5, 24],
    ])}`,
    "-draw",
    `stroke-linecap round line ${pts([
      [4, 24],
      [28, 24],
    ])}`,
    "-strip",
    touch,
  ]);
  console.log(`apple-touch-icon.png: ${kb(touch)}`);

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${path.relative(ROOT, MANIFEST)}. Run npm run format before committing.`);
}

main();
