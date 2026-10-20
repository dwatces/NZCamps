// Copies the pinned front-end libraries from node_modules into
// public/vendor/<name>-<version>/ so pages load them from this site (no CDN,
// no floating "latest" versions) under a script-src 'self' CSP.
// The versions come from devDependencies, which are pinned exactly.
// Source map comments are removed because the maps are not shipped.
//
// Usage: npm run vendor
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "vendor");

const LIBS = [
  {
    name: "leaflet",
    licence: "BSD-2-Clause",
    files: {
      "dist/leaflet.js": "leaflet.js",
      "dist/leaflet.css": "leaflet.css",
      "dist/images/layers.png": "images/layers.png",
      "dist/images/layers-2x.png": "images/layers-2x.png",
      "dist/images/marker-icon.png": "images/marker-icon.png",
      "dist/images/marker-icon-2x.png": "images/marker-icon-2x.png",
      "dist/images/marker-shadow.png": "images/marker-shadow.png",
      LICENSE: "LICENSE",
    },
  },
  {
    name: "leaflet.markercluster",
    licence: "MIT",
    files: {
      "dist/leaflet.markercluster.js": "leaflet.markercluster.js",
      "dist/MarkerCluster.css": "MarkerCluster.css",
      "dist/MarkerCluster.Default.css": "MarkerCluster.Default.css",
      "MIT-LICENCE.txt": "LICENSE",
    },
  },
  {
    name: "bootstrap",
    licence: "MIT",
    files: {
      "dist/css/bootstrap.min.css": "css/bootstrap.min.css",
      "dist/js/bootstrap.bundle.min.js": "js/bootstrap.bundle.min.js",
      LICENSE: "LICENSE",
    },
  },
];

const stripSourceMap = (text) =>
  text.replace(/\n?\/[/*]# sourceMappingURL=[^\n]*?(\s*\*\/)?\s*$/, "\n");

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const rows = [];
  for (const lib of LIBS) {
    const pkgDir = path.join(ROOT, "node_modules", lib.name);
    const { version } = require(path.join(pkgDir, "package.json"));
    const pinned = require(path.join(ROOT, "package.json")).devDependencies[lib.name];
    if (pinned !== version) {
      throw new Error(`${lib.name}: installed ${version} but package.json pins ${pinned}`);
    }
    const dest = path.join(OUT, `${lib.name}-${version}`);
    for (const [from, to] of Object.entries(lib.files)) {
      const target = path.join(dest, to);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (/\.(js|css)$/.test(from)) {
        fs.writeFileSync(target, stripSourceMap(fs.readFileSync(path.join(pkgDir, from), "utf8")));
      } else {
        fs.copyFileSync(path.join(pkgDir, from), target);
      }
    }
    rows.push(`| ${lib.name} | ${version} | ${lib.licence} | \`${lib.name}-${version}/\` |`);
  }
  fs.writeFileSync(
    path.join(OUT, "README.md"),
    [
      "# Vendored front-end libraries",
      "",
      "Copied from npm by `npm run vendor` (`scripts/vendor.js`). Do not edit these files;",
      "change the pinned version in `package.json` devDependencies and run the script again.",
      "Source map comments are removed because the maps are not shipped.",
      "",
      "| Library | Version | Licence | Folder |",
      "|---|---|---|---|",
      ...rows,
      "",
      "Each folder holds the library's own LICENSE file.",
      "",
    ].join("\n"),
  );
  console.log(`Vendored ${LIBS.length} libraries into public/vendor/`);
}

main();
