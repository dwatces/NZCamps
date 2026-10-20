// Checks the Vercel function bundle without running `vercel`.
//
// Vercel traces api/index.js with @vercel/nft and adds vercel.json's
// includeFiles. This script does the same, checks that no dev-only package
// is traced, copies the traced files into a temporary folder and runs the
// integration suite against that copy. A guard in test/helpers/guard.js
// fails the run if app code loads anything from outside the copy.
//
// Usage: npm run check:bundle
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { nodeFileTrace } = require("@vercel/nft");

const ROOT = path.join(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));
const vercel = require(path.join(ROOT, "vercel.json"));

const DEV_ONLY = [
  ...Object.keys(pkg.devDependencies || {}),
  "mongodb-memory-server-core",
  "@playwright",
  "playwright",
  "playwright-core",
  "axe-core",
  "html-validate",
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Only "<folder>/**" patterns are used in vercel.json, so only those are supported.
function folderOf(pattern) {
  const m = /^([\w./-]+)\/\*\*$/.exec(pattern || "");
  if (!m) throw new Error(`Unsupported vercel.json file pattern: ${pattern}`);
  return m[1];
}

function includeFilesFor(entry) {
  const pattern = vercel.functions[entry].includeFiles;
  if (pattern === "**") throw new Error("includeFiles is still **: the whole repo is bundled");
  return walk(path.join(ROOT, folderOf(pattern))).map((f) => path.relative(ROOT, f));
}

// express.static(path.join(__dirname, "public")) makes the tracer pull in
// every static file, although Vercel serves public/ from its CDN before the
// rewrite to the function. excludeFiles drops them again.
function isExcluded(entry, rel) {
  const pattern = vercel.functions[entry].excludeFiles;
  return Boolean(pattern) && rel.startsWith(folderOf(pattern) + "/");
}

async function main() {
  const entry = "api/index.js";
  const { fileList, warnings } = await nodeFileTrace([path.join(ROOT, entry)], { base: ROOT });
  for (const w of warnings) {
    if (!/node_modules/.test(String(w && w.message))) console.warn("trace warning:", w.message);
  }
  const files = new Set(
    [...fileList, ...includeFilesFor(entry)].filter((f) => !isExcluded(entry, f)),
  );

  const devHits = [...files].filter((f) =>
    DEV_ONLY.some((name) => f.startsWith(`node_modules/${name}/`)),
  );
  if (devHits.length) {
    console.error("Dev-only packages are traced into the function:", devHits.slice(0, 10));
    process.exit(1);
  }
  const outsideViews = [...files].filter(
    (f) => !f.startsWith("node_modules/") && !f.startsWith("views/"),
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nzcamps-bundle-"));
  const appDir = path.join(tmp, "app");
  try {
    for (const rel of files) {
      const src = path.join(ROOT, rel);
      const stat = fs.lstatSync(src);
      if (stat.isDirectory()) continue;
      const dest = path.join(appDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
    // Not part of the bundle: the suite itself and the package.json config
    // it reads. Test-only packages resolve from the parent folder.
    fs.cpSync(path.join(ROOT, "test"), path.join(appDir, "test"), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "package.json"), path.join(appDir, "package.json"));
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"), "dir");

    const bytes = [...files].reduce((n, f) => {
      try {
        return n + fs.statSync(path.join(ROOT, f)).size;
      } catch {
        return n;
      }
    }, 0);
    console.log(
      `Traced ${files.size} files (${(bytes / 1e6).toFixed(1)} MB). App files outside node_modules and views:`,
    );
    for (const f of outsideViews.sort()) console.log(`  ${f}`);

    const tests = fs
      .readdirSync(path.join(appDir, "test"))
      .filter((f) => f.endsWith(".test.js"))
      .map((f) => path.join("test", f));
    const run = spawnSync(
      process.execPath,
      ["--test", "--test-concurrency=1", "--test-reporter=dot", ...tests],
      {
        cwd: appDir,
        stdio: "inherit",
        env: { ...process.env, BUNDLE_CHECK_ROOT: appDir },
      },
    );
    if (run.status !== 0) {
      console.error("The suite failed against the bundled copy.");
      process.exitCode = run.status || 1;
      return;
    }
    console.log("Bundle check passed.");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
