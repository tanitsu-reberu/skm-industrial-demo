import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const logoPath = path.join(root, "public", "logo.png");
const publicDir = path.join(root, "public");

const logo = sharp(logoPath).resize(512, 512, { fit: "contain", background: { r: 10, g: 10, b: 10, alpha: 1 } });

await logo.clone().resize(192, 192).png({ compressionLevel: 9 }).toFile(path.join(publicDir, "icon.png"));
await logo.clone().resize(180, 180).png({ compressionLevel: 9 }).toFile(path.join(publicDir, "apple-touch-icon.png"));

const faviconSizes = [16, 32, 48];
const faviconBuffers = await Promise.all(
  faviconSizes.map((size) => logo.clone().resize(size, size).png().toBuffer()),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(faviconSizes.length, 4);

const entries = [];
const images = [];
let offset = 6 + faviconSizes.length * 16;

for (let index = 0; index < faviconSizes.length; index += 1) {
  const buffer = faviconBuffers[index];
  const size = faviconSizes[index];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(buffer.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  images.push(buffer);
  offset += buffer.length;
}

fs.writeFileSync(path.join(publicDir, "favicon.ico"), Buffer.concat([header, ...entries, ...images]));

for (const file of ["favicon.ico", "icon.png", "apple-touch-icon.png"]) {
  const { size } = fs.statSync(path.join(publicDir, file));
  console.log(`${file}: ${size} bytes`);
}