// Regenerates the PWA icon set, favicon and iOS splash screens from a single
// source of truth: the app's header mark (the lucide "radar" glyph inside a
// tinted, ringed rounded square — see components/layout/Shell.tsx).
//
// Requires `rsvg-convert` (librsvg) on PATH — a dev-only tool, not an npm
// dependency. On macOS: `brew install librsvg`. Outputs are committed, so
// contributors only re-run this when the mark or icon set changes:
//
//   node scripts/generate-pwa-assets.mjs
//
// Colors are the resolved light-theme brand tokens from src/index.css
// (--primary oklch(0.5 0.134 242.749) and --background oklch(1 0 0)).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const ICONS = join(PUBLIC, "icons");
const SPLASH = join(PUBLIC, "splash");

const PRIMARY = "#0069a8";
const BG = "#ffffff";

// The header mark, drawn in a 28×28 box (matches the size-7 / rounded-md badge
// in the header): a primary/10 fill, a primary/15 inset ring, and the radar
// glyph (lucide radar, native 24×24) scaled to 16px and centered.
const MARK = `
  <rect width="28" height="28" rx="8" fill="${PRIMARY}" fill-opacity="0.1"/>
  <rect x="0.5" y="0.5" width="27" height="27" rx="7.5" fill="none" stroke="${PRIMARY}" stroke-opacity="0.15"/>
  <g transform="translate(6 6) scale(0.6666667)" fill="none" stroke="${PRIMARY}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/>
    <path d="M4 6h.01"/>
    <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/>
    <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/>
    <path d="M12 18h.01"/>
    <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/>
    <circle cx="12" cy="12" r="2"/>
    <path d="m13.41 10.59 5.66-5.66"/>
  </g>`;

// Bare mark on a transparent background — the scalable favicon.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" role="img" aria-label="Stock Watcher">${MARK}\n</svg>\n`;

// The mark centered on an opaque tile, sized to `fraction` of the canvas so it
// stays inside the maskable safe zone (corners < 40% from center at 0.55).
function tileSvg(size, fraction = 0.55) {
  const markPx = size * fraction;
  const scale = markPx / 28;
  const offset = (size - markPx) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>
</svg>\n`;
}

// White launch screen with the mark centered — iOS apple-touch-startup-image.
function splashSvg(w, h) {
  const markPx = Math.round(Math.min(w, h) * 0.22);
  const scale = markPx / 28;
  const x = (w - markPx) / 2;
  const y = (h - markPx) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <g transform="translate(${x} ${y}) scale(${scale})">${MARK}</g>
</svg>\n`;
}

function rasterize(svg, outPath, w, h) {
  execFileSync("rsvg-convert", ["-w", String(w), "-h", String(h), "-o", outPath], { input: svg });
  console.log("  ", outPath.replace(ROOT + "/", ""));
}

// Curated set of current iPhone portrait launch screens. Devices without a
// match fall back to the white background color — seamless, since the splash
// is white too — so partial coverage degrades gracefully.
export const SPLASH_DEVICES = [
  { dw: 375, dh: 667, dpr: 2 }, // SE (2nd/3rd gen)
  { dw: 414, dh: 896, dpr: 2 }, // XR, 11
  { dw: 375, dh: 812, dpr: 3 }, // X, XS, 11 Pro, 12/13 mini
  { dw: 414, dh: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { dw: 390, dh: 844, dpr: 3 }, // 12, 13, 14
  { dw: 393, dh: 852, dpr: 3 }, // 14 Pro, 15, 15 Pro, 16
  { dw: 428, dh: 926, dpr: 3 }, // 12/13 Pro Max, 14 Plus
  { dw: 430, dh: 932, dpr: 3 }, // 14 Pro Max, 15 Plus, 15/16 Pro Max
];

function main() {
  mkdirSync(ICONS, { recursive: true });
  mkdirSync(SPLASH, { recursive: true });

  console.log("favicon:");
  writeFileSync(join(PUBLIC, "favicon.svg"), faviconSvg);
  console.log("   public/favicon.svg");
  rasterize(faviconSvg, join(ICONS, "favicon-32.png"), 32, 32);
  rasterize(faviconSvg, join(ICONS, "favicon-16.png"), 16, 16);

  console.log("app icons:");
  rasterize(tileSvg(512), join(ICONS, "icon-192.png"), 192, 192);
  rasterize(tileSvg(512), join(ICONS, "icon-512.png"), 512, 512);
  rasterize(tileSvg(512), join(ICONS, "apple-touch-icon.png"), 180, 180);

  console.log("splash screens:");
  for (const { dw, dh, dpr } of SPLASH_DEVICES) {
    const w = dw * dpr;
    const h = dh * dpr;
    rasterize(splashSvg(w, h), join(SPLASH, `splash-${w}x${h}.png`), w, h);
  }
}

main();
