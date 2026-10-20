// Known defects found in discovery. Each becomes a real test when it is fixed.
const { test } = require("node:test");

test.todo("camp pages do not publish author or reviewer email addresses (F3)");
test.todo("a </script> in a description cannot break out of the page data (F3)");
test.todo("deleteImages cannot remove another user's image (F5)");
test.todo("an anonymous GET does not create a session document (F4)");
