// Database timings. Tests shorten them by changing this object before they
// require the app (each test file runs in its own process); production uses
// these defaults.
module.exports = {
  // How long a request waits for the first connection before showing samples.
  dbWaitMs: 5000,
  // How long the driver tries to reach a server before the connect fails.
  serverSelectionTimeoutMS: 5000,
};
