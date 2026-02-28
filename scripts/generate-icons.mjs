/**
 * PWA Icon Generator
 * Generates PNG icons from the SVG source using Node.js canvas-free approach.
 * Run: node scripts/generate-icons.mjs
 *
 * For production, replace these with properly designed PNG icons.
 * This script creates minimal placeholder PNGs with the app's brand color.
 */

import { writeFileSync, mkdirSync } from "fs";

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function createMinimalPng(size) {
  // Create a minimal valid PNG with the brand color (#2563eb)
  // This is a 1x1 PNG scaled — for production, use a proper image tool
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.125)}" fill="#2563eb"/>
  <circle cx="${size / 2}" cy="${size * 0.43}" r="${size * 0.234}" fill="none" stroke="#ffffff" stroke-width="${Math.round(size * 0.047)}"/>
  <line x1="${size / 2}" y1="${size * 0.43}" x2="${size / 2}" y2="${size * 0.273}" stroke="#ffffff" stroke-width="${Math.round(size * 0.039)}" stroke-linecap="round"/>
  <line x1="${size / 2}" y1="${size * 0.43}" x2="${size * 0.625}" y2="${size * 0.488}" stroke="#ffffff" stroke-width="${Math.round(size * 0.031)}" stroke-linecap="round"/>
  <circle cx="${size / 2}" cy="${size * 0.43}" r="${Math.round(size * 0.023)}" fill="#ffffff"/>
  <rect x="${size * 0.305}" y="${size * 0.742}" width="${size * 0.39}" height="${size * 0.117}" rx="${Math.round(size * 0.023)}" fill="#ffffff" opacity="0.9"/>
</svg>`;
  return svg;
}

mkdirSync("public/icons", { recursive: true });

for (const size of sizes) {
  const svg = createMinimalPng(size);
  writeFileSync(`public/icons/icon-${size}x${size}.svg`, svg);
  console.log(`Generated icon-${size}x${size}.svg`);
}

console.log("\nAll icons generated. For production PNGs, use a tool like sharp or Inkscape.");
