const request = require("supertest");

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

// A cookie-keeping supertest agent with the app's common user journeys.
function agentFor(app) {
  const agent = request.agent(app);

  agent.signUp = async (overrides = {}) => {
    const id = uniq();
    const user = {
      username: `user_${id}`,
      email: `user_${id}@example.test`,
      password: "correct-horse-battery",
      ...overrides,
    };
    const res = await agent.post("/register").type("form").send(user);
    return { user, res };
  };

  agent.logIn = (username, password) =>
    agent.post("/login").type("form").send({ username, password });

  agent.logOut = () => agent.post("/logout");

  agent.createCamp = (fields = {}, files = []) => {
    const camp = {
      title: "Test camp",
      location: "Wellington",
      price: "18",
      description: "A test camp for the integration suite.",
      ...fields,
    };
    let req = agent.post("/camps");
    for (const [k, v] of Object.entries(camp)) req = req.field(`camp[${k}]`, v);
    for (const f of files) req = req.attach("image", f.buffer, f.options);
    return req;
  };

  return agent;
}

// Extracts a camp id from a redirect such as /camps/<id>.
function campIdFrom(res) {
  const m = /^\/camps\/([a-f0-9]{24})$/.exec(res.headers.location || "");
  return m && m[1];
}

module.exports = { agentFor, campIdFrom, uniq };
