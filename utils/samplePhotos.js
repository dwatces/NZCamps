// Photos used by the sample listings, all from Unsplash. The alt text says
// what each photo shows; `place` is the location exactly as the photo's
// Unsplash page states it (null when the page gives none). The same list is
// in public/images/CREDITS.md, and a test keeps the two in step.
//
// The /stylesheets/ paths are the original files: camps already in the live
// database point at them, so they keep their address.
const PHOTOS = [
  {
    url: "/stylesheets/anderson-aguirre-bjTQqa6o_cM-unsplash.jpg",
    alt: "A quiet sealed road through tall beech forest",
    credit: "Anderson Aguirre",
    page: "https://unsplash.com/photos/bjTQqa6o_cM",
    place: "Milford Sound, New Zealand",
  },
  {
    url: "/stylesheets/mitchell-luo-CEowgw6VXbE-unsplash.jpg",
    alt: "A river winding along a bush-covered valley below snowy peaks",
    credit: "Mitchell Luo",
    page: "https://unsplash.com/photos/CEowgw6VXbE",
    place: "New Zealand",
  },
  {
    url: "/stylesheets/casey-horner-_aVKjJhFdn0-unsplash.jpg",
    alt: "A shallow, rocky stream running through dense native bush",
    credit: "Casey Horner",
    page: "https://unsplash.com/photos/_aVKjJhFdn0",
    place: "Whangarei, New Zealand",
  },
  {
    url: "/stylesheets/tyler-lastovich-MfRNe40ihls-unsplash.jpg",
    alt: "A gravel walking track between tree ferns and thick bush",
    credit: "Tyler Lastovich",
    page: "https://unsplash.com/photos/MfRNe40ihls",
    place: "Hokitika Gorge, Kokatahi, New Zealand",
  },
  {
    url: "/images/samples/tekapo-look-up-look-down-JUx3hPMNXLg.jpg",
    alt: "Purple and white lupins in front of a turquoise lake and distant mountains",
    credit: "Look Up Look Down Photography",
    page: "https://unsplash.com/photos/JUx3hPMNXLg",
    place: "Lake Tekapo, New Zealand",
  },
  {
    url: "/images/samples/hahei-kura-tregenza-U3LZJBdTRnU.jpg",
    alt: "Clear turquoise sea, rocks and a white sand beach seen from above",
    credit: "Kura Tregenza",
    page: "https://unsplash.com/photos/U3LZJBdTRnU",
    place: "Unnamed Road, Hahei 3591, New Zealand, Hahei",
  },
  {
    url: "/images/samples/abel-tasman-colin-watts-dXBFFJvPDbQ.jpg",
    alt: "A curved sandy beach and green water below bush-covered hills",
    credit: "Colin Watts",
    page: "https://unsplash.com/photos/dXBFFJvPDbQ",
    place: "Abel Tasman National Park, South Island, New Zealand",
  },
  {
    url: "/images/samples/taupo-adriel-kloppenburg-1ivyLJo-9NU.jpg",
    alt: "Flax and long grass above the calm shore of a wide lake",
    credit: "Adriel Kloppenburg",
    page: "https://unsplash.com/photos/1ivyLJo-9NU",
    place: "Lake Taupo, Waikato, New Zealand",
  },
  {
    url: "/images/samples/kaikoura-rodrigo-kammer-v4NNY7IMAas.jpg",
    alt: "A coast road between the sea and the mountains, seen from above",
    credit: "Rodrigo Kammer",
    page: "https://unsplash.com/photos/v4NNY7IMAas",
    place: "Kaikōura, New Zealand",
  },
];

const byUrl = new Map(PHOTOS.map((p) => [p.url, p]));

// The credited photo at this address, or null (uploads have no credit).
const samplePhoto = (url) => byUrl.get(url) || null;

module.exports = { PHOTOS, samplePhoto };
