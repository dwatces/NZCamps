// Loaded first by every test file (through test/helpers/index.js).
// 1. Network guard: anything that is not loopback throws, so no test can
//    reach Nominatim, OpenCage, Cloudinary or a real database.
// 2. Crash guard: unhandled rejections and uncaught exceptions are recorded
//    and fail the file. On Express 4 these kill the server process.
const dns = require("node:dns");
const net = require("node:net");
const path = require("node:path");

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1", "[::1]"]);
const isLoopback = (host) => LOOPBACK.has(String(host || "").toLowerCase());

function blocked(what, host) {
  const err = new Error(`Network guard: blocked ${what} to ${host}`);
  err.code = "ENETGUARD";
  return err;
}

const realFetch = globalThis.fetch;
globalThis.fetch = async function guardedFetch(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!isLoopback(url.hostname)) throw blocked("fetch", url.hostname);
  return realFetch(input, init);
};

const realLookup = dns.lookup;
dns.lookup = function guardedLookup(hostname, ...rest) {
  if (!isLoopback(hostname)) {
    const cb = rest[rest.length - 1];
    const err = blocked("DNS lookup", hostname);
    if (typeof cb === "function") process.nextTick(cb, err);
    return {};
  }
  return realLookup.call(this, hostname, ...rest);
};
const realPromisesLookup = dns.promises.lookup;
dns.promises.lookup = async function guardedPromisesLookup(hostname, ...rest) {
  if (!isLoopback(hostname)) throw blocked("DNS lookup", hostname);
  return realPromisesLookup.call(this, hostname, ...rest);
};

// IP literals skip DNS, so check them where sockets connect.
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const a = Array.isArray(args[0]) ? args[0] : args;
  let host;
  if (a[0] && typeof a[0] === "object") {
    if (!a[0].path) host = a[0].host || "localhost";
  } else if (typeof a[0] === "number" || /^\d+$/.test(String(a[0]))) {
    host = typeof a[1] === "string" ? a[1] : "localhost";
  }
  if (host && net.isIP(host) && !isLoopback(host)) throw blocked("socket", host);
  return realConnect.apply(this, args);
};

const crashes = [];
process.on("unhandledRejection", (reason) => {
  crashes.push(reason);
  process.exitCode = 1;
  console.error("Unhandled rejection in test process:", reason);
});
process.on("uncaughtException", (err) => {
  crashes.push(err);
  process.exitCode = 1;
  console.error("Uncaught exception in test process:", err);
});

// Bundle check (scripts/check-bundle.js): app code must load only files that
// were copied into the bundle folder. Test files may load test-only packages.
if (process.env.BUNDLE_CHECK_ROOT) {
  const Module = require("node:module");
  const fsReal = require("node:fs").realpathSync;
  const root = fsReal(process.env.BUNDLE_CHECK_ROOT) + path.sep;
  const testDir = root + "test" + path.sep;
  const realResolve = Module._resolveFilename;
  Module._resolveFilename = function bundleResolve(request, parent, ...rest) {
    const resolved = realResolve.call(this, request, parent, ...rest);
    const from = parent && parent.filename;
    if (
      from &&
      from.startsWith(root) &&
      !from.startsWith(testDir) &&
      path.isAbsolute(resolved) &&
      !resolved.startsWith(root)
    ) {
      throw new Error(`Bundle check: ${request} (from ${from}) is not in the function bundle`);
    }
    return resolved;
  };
}

module.exports = { crashes, isLoopback };
