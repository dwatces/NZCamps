// The photo credits page (/credits): every photo the site shows, who took
// it, its Unsplash page, the location that page gives and where the site
// uses it. Sample photos come from utils/samplePhotos.js (the list the
// CREDITS.md test checks); the two site photos are listed here.
const { PHOTOS } = require("./samplePhotos");
const demoCamps = require("../seeds/demoData");

const SITE_PHOTOS = [
  {
    credit: "Robert Koorenny",
    page: "https://unsplash.com/photos/Py2ULdPgHac",
    place: null,
    usedFor: ["the home page"],
  },
  {
    credit: "Harry Knight",
    page: "https://unsplash.com/photos/mqpY5vyNrKE",
    place: "New Zealand",
    usedFor: ["the log in and sign up pages"],
  },
];

function usedFor(url) {
  const camps = demoCamps.filter((c) => c.images.some((img) => img.url === url));
  const uses = camps.map((c) => `the sample listing ${c.title}`);
  if (url === "/stylesheets/mitchell-luo-CEowgw6VXbE-unsplash.jpg")
    uses.push("the page background");
  return uses;
}

module.exports = [
  ...PHOTOS.map((p) => ({
    credit: p.credit,
    page: p.page,
    place: p.place,
    alt: p.alt,
    usedFor: usedFor(p.url),
  })),
  ...SITE_PHOTOS,
];
