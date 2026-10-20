// Always require this first: it installs the network and crash guards.
const guard = require("./guard");
const { startDb } = require("./db");
const { makeApp, closeApp, stubGeocode, ROOT } = require("./app");
const { agentFor, campIdFrom, uniq } = require("./agent");

// Tests that read repo files or run scripts outside the function bundle
// (seeds, public/) are skipped when scripts/check-bundle.js runs the suite.
const notInBundle = {
  skip: process.env.BUNDLE_CHECK_ROOT ? "not part of the function bundle" : false,
};

module.exports = {
  notInBundle,
  crashes: guard.crashes,
  startDb,
  makeApp,
  closeApp,
  stubGeocode,
  agentFor,
  campIdFrom,
  uniq,
  ROOT,
};
