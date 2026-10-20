// F4 with review C4: failed logins slow down, never lock for good, and every
// failure shows the same message.
const authOptions = require("../models/authOptions");
// Test-sized back-off: interval^ln(attempts + 1) ms, capped at maxInterval.
authOptions.interval = 1000;
authOptions.maxInterval = 600;

const h = require("./helpers");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

let db;
let app;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({ dbUri: db.uri });
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

async function failureMessage(agent) {
  const page = await agent.get("/login");
  return page.text.includes(authOptions.GENERIC);
}

test("the right password is refused during the back-off, then accepted", async () => {
  const agent = h.agentFor(app);
  const { user } = await agent.signUp();
  await agent.logOut();

  assert.equal((await agent.logIn(user.username, "wrong-1")).headers.location, "/login");
  await sleep(200);
  assert.equal((await agent.logIn(user.username, "wrong-2")).headers.location, "/login");
  assert.ok(await failureMessage(agent), "generic message for a wrong password");

  const tooSoon = await agent.logIn(user.username, user.password);
  assert.equal(tooSoon.headers.location, "/login", "refused while the interval runs");
  assert.ok(await failureMessage(agent), "same message during the back-off");

  await sleep(750);
  const ok = await agent.logIn(user.username, user.password);
  assert.equal(ok.headers.location, "/camps", "accepted once the interval has passed");
});

test("the account is never locked for good", async () => {
  const agent = h.agentFor(app);
  const { user } = await agent.signUp();
  await agent.logOut();
  for (let i = 0; i < 12; i++) await agent.logIn(user.username, `wrong-${i}`);
  await sleep(750);
  const ok = await agent.logIn(user.username, user.password);
  assert.equal(ok.headers.location, "/camps");
});

test("an unknown username gets the same message", async () => {
  const agent = h.agentFor(app);
  const res = await agent.logIn("no_such_user", "whatever-password");
  assert.equal(res.headers.location, "/login");
  assert.ok(await failureMessage(agent));
});
