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

// A small JPEG laid out like a phone photo: APP0, then an Exif APP1 with an
// orientation and a GPS block, an IPTC APP13, a quantisation table and the
// scan. Only the structure matters to the metadata stripper.
function segment(marker, payload) {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}
function phoneJpeg({ orientation = 6 } = {}) {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x0112, 10); // Orientation
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt16LE(0x8825, 22); // GPS IFD pointer
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(46, 30);
  const exif = Buffer.concat([
    Buffer.from("Exif\0\0", "latin1"),
    tiff,
    Buffer.from("GPSLatitude -41.2865 GPSLongitude 174.7762 Phone Model X", "latin1"),
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    segment(0xe1, exif),
    segment(0xed, Buffer.from("Photoshop 3.0\0" + "8BIM IPTC byline: Someone", "latin1")),
    segment(0xdb, Buffer.alloc(65, 1)),
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.alloc(200, 0x55),
    Buffer.from([0xff, 0xd9]),
  ]);
}

module.exports = { PNG, JPEG, WEBP, HTML, file, bigPng, phoneJpeg };
