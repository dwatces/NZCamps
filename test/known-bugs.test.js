// Known defects found in discovery. Each becomes a real test when it is fixed.
const { test } = require("node:test");

test.todo("deleteImages cannot remove another user's image (F5)");
test.todo("an anonymous GET does not create a session document (F4)");
