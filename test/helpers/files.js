// Small upload fixtures. Only the first bytes matter to the type check.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from("WEBPVP8 "),
  Buffer.alloc(40, 1),
]);
const HTML = Buffer.from("<!doctype html><script>alert(1)</script>");

const file = (buffer, filename, contentType) => ({ buffer, options: { filename, contentType } });

// A PNG header followed by padding, to reach a given size.
const bigPng = (bytes) => Buffer.concat([PNG, Buffer.alloc(bytes - PNG.length, 0)]);

module.exports = { PNG, JPEG, WEBP, HTML, file, bigPng };
