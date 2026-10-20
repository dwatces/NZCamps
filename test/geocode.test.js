// F9: geocoding over fetch, with a timeout. fetch is stubbed; the network
// guard would block a real request.
require("./helpers");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const runtimeConfig = require("../utils/runtimeConfig");
const geocodeNZ = require("../utils/geocode");

const realFetch = globalThis.fetch;
let seen;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  seen = [];
  delete process.env.OPENCAGE_ACCESS_TOKEN;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.OPENCAGE_ACCESS_TOKEN;
});

test("the default geocoder timeout is 5 seconds", () => {
  assert.equal(runtimeConfig.geocodeTimeoutMs, 5000);
});

test("OpenCage is asked for New Zealand only, with the key as a parameter", async () => {
  process.env.OPENCAGE_ACCESS_TOKEN = "test-key-not-real";
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return json({
      status: { code: 200 },
      results: [{ geometry: { lat: -44.0, lng: 170.47 }, formatted: "Lake Tekapo, New Zealand" }],
    });
  };
  const result = await geocodeNZ("Lake Tekapo");
  assert.deepEqual(result, { lat: -44.0, lng: 170.47, name: "Lake Tekapo, New Zealand" });
  const url = new URL(seen[0].url);
  assert.equal(url.hostname, "api.opencagedata.com");
  assert.equal(url.searchParams.get("countrycode"), "nz");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(url.searchParams.get("no_annotations"), "1");
  assert.ok(url.searchParams.has("key"), "the key travels as the key parameter");
  assert.equal(url.searchParams.get("q"), "Lake Tekapo, New Zealand");
  assert.ok(seen[0].init.signal instanceof AbortSignal, "the request can be aborted");
});

test("OpenCage with no result is 'not found'", async () => {
  process.env.OPENCAGE_ACCESS_TOKEN = "test-key-not-real";
  globalThis.fetch = async () => json({ status: { code: 200 }, results: [] });
  assert.equal(await geocodeNZ("Nowhere at all"), null);
});

test("an OpenCage error status throws instead of looking like 'not found'", async () => {
  process.env.OPENCAGE_ACCESS_TOKEN = "test-key-not-real";
  globalThis.fetch = async () => json({ status: { code: 402 } }, 402);
  await assert.rejects(geocodeNZ("Taupō"), /OpenCage answered 402/);
});

test("without a key, Nominatim is used with its User-Agent", async () => {
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return json([{ lat: "-36.83", lon: "175.79", display_name: "Hahei, Coromandel" }]);
  };
  const result = await geocodeNZ("Hahei");
  assert.deepEqual(result, { lat: -36.83, lng: 175.79, name: "Hahei, Coromandel" });
  const url = new URL(seen[0].url);
  assert.equal(url.hostname, "nominatim.openstreetmap.org");
  assert.equal(url.searchParams.get("countrycodes"), "nz");
  assert.match(seen[0].init.headers["User-Agent"], /^nz-camps /);
});

test("a stalled geocoder is aborted at the timeout", async () => {
  const saved = runtimeConfig.geocodeTimeoutMs;
  runtimeConfig.geocodeTimeoutMs = 300;
  globalThis.fetch = (url, init) =>
    new Promise((resolve, reject) => {
      const stall = setTimeout(() => resolve(json([])), 6000);
      init.signal.addEventListener("abort", () => {
        clearTimeout(stall);
        reject(init.signal.reason);
      });
    });
  const started = Date.now();
  try {
    await assert.rejects(geocodeNZ("Somewhere slow"), (err) => err.name === "TimeoutError");
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 250 && elapsed < 2000, `aborted after ${elapsed} ms`);
  } finally {
    runtimeConfig.geocodeTimeoutMs = saved;
  }
});
