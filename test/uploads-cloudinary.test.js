// F5 and F9 with Cloudinary configured (fake credentials, SDK calls stubbed;
// the network guard would block any real request).
const h = require("./helpers");
const f = require("./helpers/files");
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

let db;
let app;
let Camp;
let cloudinary;
const calls = { upload: [], destroy: [] };
let failUploads = false;

before(async () => {
  db = await h.startDb();
  app = await h.makeApp({
    dbUri: db.uri,
    env: { CLOUDINARY_NAME: "fake-cloud", CLOUDINARY_API_KEY: "fake", CLOUDINARY_SECRET: "fake" },
  });
  Camp = require("../models/camp");
  ({ cloudinary } = require("../cloudinary"));
  let n = 0;
  cloudinary.uploader.upload_stream = (options, cb) => ({
    end(buffer) {
      calls.upload.push({ options, bytes: buffer.length });
      n += 1;
      setImmediate(() =>
        failUploads
          ? cb(new Error("Cloudinary says no: api_secret=fake"))
          : cb(null, {
              secure_url: `https://res.cloudinary.com/fake-cloud/image/upload/v1/NZCamps/img${n}.png`,
              public_id: `NZCamps/img${n}`,
            }),
      );
    },
  });
  cloudinary.uploader.destroy = async (publicId) => {
    calls.destroy.push(publicId);
    return { result: "ok" };
  };
});

beforeEach(() => {
  calls.upload.length = 0;
  calls.destroy.length = 0;
  failUploads = false;
});

after(async () => {
  await h.closeApp();
  await db.stop();
  assert.deepEqual(h.crashes, [], "no unhandled rejections or uncaught exceptions");
});

async function signedIn() {
  const agent = h.agentFor(app);
  await agent.signUp();
  return agent;
}

const edit = (agent, id, extra = []) => {
  let req = agent
    .post(`/camps/${id}?_method=PUT`)
    .field("camp[title]", "Edited")
    .field("camp[location]", "Wellington")
    .field("camp[price]", "10")
    .field("camp[description]", "Edited.");
  for (const imageId of extra) req = req.field("deleteImages[]", imageId);
  return req;
};

test("uploads go to the NZCamps folder with snake_case allowed_formats", async () => {
  const agent = await signedIn();
  const res = await agent.createCamp({ title: "Cloud Camp" }, [
    f.file(f.PNG, "a.png", "image/png"),
  ]);
  assert.equal(res.status, 302);
  assert.equal(calls.upload.length, 1);
  assert.deepEqual(calls.upload[0].options, {
    folder: "NZCamps",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  });
  const camp = await Camp.findById(h.campIdFrom(res)).lean();
  assert.match(camp.images[0].url, /^https:\/\/res\.cloudinary\.com\/fake-cloud\//);
  assert.equal(camp.images[0].filename, "NZCamps/img1");
});

test("nothing is uploaded when the form is refused", async () => {
  const agent = await signedIn();
  const badPrice = await agent.createCamp({ title: "No Upload", price: "$20" }, [
    f.file(f.PNG, "a.png", "image/png"),
  ]);
  assert.equal(badPrice.status, 422);
  const lost = await agent.createCamp({ title: "No Upload", location: "Nowhere" }, [
    f.file(f.PNG, "a.png", "image/png"),
  ]);
  assert.equal(lost.status, 422);
  assert.equal(calls.upload.length, 0, "no orphaned uploads");
});

test("an upload failure gives a plain message and stores nothing", async () => {
  const agent = await signedIn();
  failUploads = true;
  const res = await agent.createCamp({ title: "Upload Fails" }, [
    f.file(f.PNG, "a.png", "image/png"),
  ]);
  assert.equal(res.status, 503);
  assert.match(res.text, /couldn&#39;t save your photos right now/);
  assert.doesNotMatch(res.text, /api_secret|Cloudinary says no/);
  assert.equal(await Camp.countDocuments({ title: "Upload Fails" }), 0);
});

test("editing your camp with someone else's image id destroys nothing of theirs", async () => {
  const bob = await signedIn();
  const bobCamp = h.campIdFrom(
    await bob.createCamp({ title: "Bob Cloud" }, [f.file(f.PNG, "b.png", "image/png")]),
  );
  const bobImage = (await Camp.findById(bobCamp).lean()).images[0];

  const alice = await signedIn();
  const aliceCamp = h.campIdFrom(await alice.createCamp({ title: "Alice Cloud" }));
  calls.destroy.length = 0;
  const res = await edit(alice, aliceCamp, [String(bobImage._id)]);
  assert.equal(res.status, 302);
  assert.deepEqual(calls.destroy, [], "zero destroy calls");
  assert.equal((await Camp.findById(bobCamp).lean()).images.length, 1);
});

test("removing your own Cloudinary image destroys exactly that image", async () => {
  const agent = await signedIn();
  const id = h.campIdFrom(
    await agent.createCamp({ title: "Own Cloud" }, [
      f.file(f.PNG, "a.png", "image/png"),
      f.file(f.PNG, "b.png", "image/png"),
    ]),
  );
  const [first, second] = (await Camp.findById(id).lean()).images;
  const res = await edit(agent, id, [String(first._id)]);
  assert.equal(res.status, 302);
  assert.deepEqual(calls.destroy, [first.filename]);
  const left = (await Camp.findById(id).lean()).images;
  assert.deepEqual(
    left.map((i) => i.filename),
    [second.filename],
  );
});

test("deleting a camp destroys its Cloudinary images but not seeded files", async () => {
  const agent = await signedIn();
  const id = h.campIdFrom(
    await agent.createCamp({ title: "Delete Cloud" }, [f.file(f.PNG, "a.png", "image/png")]),
  );
  await Camp.updateOne({ _id: id }, { $push: { images: { url: "/stylesheets/x.jpg" } } });
  const [img] = (await Camp.findById(id).lean()).images;
  calls.destroy.length = 0;
  const res = await agent.post(`/camps/${id}?_method=DELETE`);
  assert.equal(res.status, 302);
  assert.deepEqual(calls.destroy, [img.filename]);
});
