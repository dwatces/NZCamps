/* Sample campgrounds: invented names and illustrative prices at real NZ
   places. Served in demo mode (no database) and copied into a database by
   seeds/seedAtlas.js. Every one is labelled as a sample (isDemo). */
module.exports = [
  {
    _id: "demo1",
    title: "Milford Sound Basecamp",
    price: 18,
    description: "Demo campground: fiord views, kea patrols, sandfly negotiations mandatory.",
    location: "Fiordland National Park",
    images: [{ url: "/stylesheets/anderson-aguirre-bjTQqa6o_cM-unsplash.jpg" }],
    geometry: { type: "Point", coordinates: [167.9256, -44.6717] },
    reviews: [],
    isDemo: true,
    author: { username: "ranger" },
  },
  {
    _id: "demo2",
    title: "Tekapo Lakeside Pitch",
    price: 22,
    description: "Demo campground: dark-sky reserve overhead, lupins at the door.",
    location: "Lake Tekapo, Canterbury",
    images: [{ url: "/stylesheets/casey-horner-_aVKjJhFdn0-unsplash.jpg" }],
    geometry: { type: "Point", coordinates: [170.4771, -44.0046] },
    reviews: [],
    isDemo: true,
    author: { username: "ranger" },
  },
  {
    _id: "demo3",
    title: "Coromandel Cove Camp",
    price: 15,
    description: "Demo campground: kayak to the arch before the tour boats wake up.",
    location: "Hahei, Coromandel",
    images: [{ url: "/stylesheets/tyler-lastovich-MfRNe40ihls-unsplash.jpg" }],
    geometry: { type: "Point", coordinates: [175.7917, -36.8277] },
    reviews: [],
    isDemo: true,
    author: { username: "ranger" },
  },
];
