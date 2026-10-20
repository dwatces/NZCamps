// Always require this first: it installs the network and crash guards.
const guard = require("./guard");
const { startDb } = require("./db");
const { makeApp, closeApp, stubGeocode, ROOT } = require("./app");
const { agentFor, campIdFrom, uniq } = require("./agent");

module.exports = {
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
