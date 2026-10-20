/* Sample campgrounds: invented listings with illustrative prices at real NZ
   places. Demo mode (no database) serves them as they are, and
   seeds/seedAtlas.js copies them into a database. Every one is labelled as a
   sample (isDemo) and starts "Demo campground:". There are no sample reviews.

   The first three titles and ids match camps already in the live database
   (the seeder skips titles that exist), so keep them as they are. The other
   names follow a plain "<place> sample site" pattern so none can be mistaken
   for a real campground. Photos and their credits: utils/samplePhotos.js. */
const { samplePhoto } = require("../utils/samplePhotos");

const photo = (url) => {
  const p = samplePhoto(url);
  if (!p) throw new Error(`No credit recorded for ${url}`);
  return { url: p.url, alt: p.alt };
};

// All eight were written on the same day; a minute apart keeps "newest first" stable.
const added = (n) => new Date(Date.UTC(2026, 9, 20, 0, n)).toISOString();

const sample = (n, fields) => ({
  _id: `demo${n}`,
  ...fields,
  reviews: [],
  ratingAvg: null,
  reviewCount: 0,
  isDemo: true,
  author: { username: "ranger" },
  createdAt: added(n),
});

module.exports = [
  sample(1, {
    title: "Milford Sound Basecamp",
    price: 18,
    description:
      "Demo campground: an example listing on the road into Milford Sound, with tent sites under beech forest. Pack insect repellent for the sandflies.",
    location: "Fiordland National Park",
    images: [
      photo("/stylesheets/anderson-aguirre-bjTQqa6o_cM-unsplash.jpg"),
      photo("/stylesheets/mitchell-luo-CEowgw6VXbE-unsplash.jpg"),
    ],
    geometry: { type: "Point", coordinates: [167.8688, -44.619] },
  }),
  sample(2, {
    title: "Tekapo Lakeside Pitch",
    price: 22,
    description:
      "Demo campground: an example lakeside pitch at Takapō / Lake Tekapo, inside the dark sky reserve. Lupins flower along the shore in early summer.",
    location: "Lake Tekapo, Canterbury",
    images: [photo("/images/samples/tekapo-look-up-look-down-JUx3hPMNXLg.jpg")],
    geometry: { type: "Point", coordinates: [170.4777, -44.0045] },
  }),
  sample(3, {
    title: "Coromandel Cove Camp",
    price: 15,
    description:
      "Demo campground: an example beach camp at Hahei, near Te Whanganui-A-Hei (Cathedral Cove) on the Coromandel coast.",
    location: "Hahei, Coromandel",
    images: [photo("/images/samples/hahei-kura-tregenza-U3LZJBdTRnU.jpg")],
    geometry: { type: "Point", coordinates: [175.8028, -36.8402] },
  }),
  sample(4, {
    title: "Whangārei bush stream sample site",
    price: 12,
    description:
      "Demo campground: an example of a small bush site near Whangārei, beside a shallow stream. Shows how a low-cost listing looks.",
    location: "Whangārei, Northland",
    images: [photo("/stylesheets/casey-horner-_aVKjJhFdn0-unsplash.jpg")],
    geometry: { type: "Point", coordinates: [174.3194, -35.7275] },
  }),
  sample(5, {
    title: "Hokitika Gorge sample site",
    price: 0,
    description:
      "Demo campground: an example of a free, basic site near the Hokitika Gorge walk. Shows how a listing with no charge looks.",
    location: "Hokitika Gorge, West Coast",
    images: [photo("/stylesheets/tyler-lastovich-MfRNe40ihls-unsplash.jpg")],
    geometry: { type: "Point", coordinates: [171.0159, -42.9552] },
  }),
  sample(6, {
    title: "Abel Tasman coast sample site",
    price: 25,
    description:
      "Demo campground: an example coastal site at Mārahau, at the southern end of the Abel Tasman Coast Track.",
    location: "Mārahau, Abel Tasman",
    images: [photo("/images/samples/abel-tasman-colin-watts-dXBFFJvPDbQ.jpg")],
    geometry: { type: "Point", coordinates: [173.0098, -41.0053] },
  }),
  sample(7, {
    title: "Lake Taupō shore sample site",
    price: 20,
    description:
      "Demo campground: an example lakeside site near Taupō, with room for campervans and tents.",
    location: "Taupō, Waikato",
    images: [photo("/images/samples/taupo-adriel-kloppenburg-1ivyLJo-9NU.jpg")],
    geometry: { type: "Point", coordinates: [176.0695, -38.6866] },
  }),
  sample(8, {
    title: "Kaikōura coast sample site",
    price: 28,
    description:
      "Demo campground: an example site on the Kaikōura coast, between the mountains and the sea.",
    location: "Kaikōura, Canterbury",
    images: [photo("/images/samples/kaikoura-rodrigo-kammer-v4NNY7IMAas.jpg")],
    geometry: { type: "Point", coordinates: [173.6811, -42.4006] },
  }),
];
