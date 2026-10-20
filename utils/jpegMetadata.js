// Removes the metadata segments a phone writes into a JPEG: APP1 (Exif and
// XMP, which can hold the GPS position, the camera and the time) and APP13
// (IPTC). Only the Exif orientation is kept, rewritten as a minimal Exif
// block, so a portrait photo still displays upright. The image data itself
// is copied unchanged. Anything that does not parse as a JPEG is returned as
// it was.

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP13 = 0xed;
const ORIENTATION_TAG = 0x0112;

// The orientation (1 to 8) from an APP1 payload, or null.
function readOrientation(payload) {
  if (payload.length < 14 || payload.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const tiff = payload.subarray(6);
  const order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  if (tiff.length < 8) return null;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === ORIENTATION_TAG) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

// A complete APP1 segment holding only the orientation tag.
function orientationSegment(value) {
  const payload = Buffer.alloc(32);
  payload.write("Exif\0\0", 0, "latin1");
  payload.write("MM", 6, "latin1"); // big-endian TIFF header
  payload.writeUInt16BE(42, 8);
  payload.writeUInt32BE(8, 10); // first IFD right after the header
  payload.writeUInt16BE(1, 14); // one entry
  payload.writeUInt16BE(ORIENTATION_TAG, 16);
  payload.writeUInt16BE(3, 18); // SHORT
  payload.writeUInt32BE(1, 20); // one value
  payload.writeUInt16BE(value, 24);
  payload.writeUInt32BE(0, 28); // no next IFD
  const header = Buffer.from([0xff, APP1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

function stripJpegMetadata(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xff || buf[1] !== SOI) return buf;
  const kept = [];
  let orientation = null;
  let removed = false;
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) return buf;
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === SOS || marker === EOI) {
      // Entropy-coded data follows: copy the rest as it is.
      if (!removed) return buf;
      const out = [buf.subarray(0, 2)];
      const afterApp0 = kept.length && kept[0][1] === APP0 ? 1 : 0;
      out.push(...kept.slice(0, afterApp0));
      if (orientation && orientation !== 1) out.push(orientationSegment(orientation));
      out.push(...kept.slice(afterApp0), buf.subarray(i));
      return Buffer.concat(out);
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) return buf;
    const length = buf.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buf.length) return buf;
    const segment = buf.subarray(i, i + 2 + length);
    if (marker === APP1) {
      if (orientation === null) orientation = readOrientation(segment.subarray(4));
      removed = true;
    } else if (marker === APP13) {
      removed = true;
    } else {
      kept.push(segment);
    }
    i += 2 + length;
  }
  return buf;
}

module.exports = { stripJpegMetadata, readOrientation, orientationSegment };
