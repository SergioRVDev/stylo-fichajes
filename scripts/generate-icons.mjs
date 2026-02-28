/**
 * Script to generate PNG icons from SVG for PWA manifest.
 * Run: node scripts/generate-icons.mjs
 *
 * Requires a canvas library. If not available, the SVG icons
 * in public/icons/ will be used directly by the manifest
 * (supported by modern browsers).
 *
 * For production, generate PNGs using an online tool like
 * https://realfavicongenerator.net or a design tool.
 */

import { readFileSync, writeFileSync } from "fs";

const sizes = [192, 512];
const variants = [
  { src: "public/icons/icon.svg", prefix: "icon" },
  { src: "public/icons/icon-maskable.svg", prefix: "icon-maskable" },
];

console.log("PNG icon generation requires a canvas library.");
console.log("SVG icons are already configured in the manifest.");
console.log("");
console.log("To generate PNGs, use one of these options:");
console.log("  1. https://realfavicongenerator.net");
console.log("  2. Figma/Sketch export");
console.log("  3. Install sharp: npm i -D sharp && modify this script");
console.log("");
console.log("Required PNG files:");
for (const variant of variants) {
  for (const size of sizes) {
    console.log(`  public/icons/${variant.prefix}-${size}x${size}.png`);
  }
}
