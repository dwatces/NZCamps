const { MongoMemoryServer } = require("mongodb-memory-server");

// One in-memory mongod per test file. The port is left to the OS (never a
// 72xx app port) and the binary version comes from package.json config.
async function startDb() {
  const server = await MongoMemoryServer.create();
  return {
    server,
    uri: server.getUri("nzcamps-test"),
    stop: () => server.stop({ doCleanup: true, force: true }),
  };
}

module.exports = { startDb };
