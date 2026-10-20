const { MongoMemoryServer } = require("mongodb-memory-server");

// One in-memory mongod per test file. The port is left to the OS (never a
// 72xx app port) and the binary version comes from package.json config.
async function startDb() {
  // A generous launch timeout: the shared machine can be slow to start mongod.
  const server = await MongoMemoryServer.create({ instance: { launchTimeout: 30000 } });
  return {
    server,
    uri: server.getUri("nzcamps-test"),
    stop: () => server.stop({ doCleanup: true, force: true }),
  };
}

module.exports = { startDb };
