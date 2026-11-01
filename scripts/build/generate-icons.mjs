#!/usr/bin/env node
/**
 * Rasterize a brand SVG into the PNG icon set used by the web app manifest and
 * the iOS home screen. Playwright Chromium renders the vector, so no extra image
 * tooling is required.
 *
 * Usage:
 *   node scripts/build/generate-icons.mjs --svg build-config/logo.svg \
 *     --out build-config/icons --out frontend/public/icons --ink '#172033'
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Padding is the margin on each side of the canvas. iOS crops the icon with its
// own rounded mask, and Android maskable icons must keep artwork inside a
// circle of 80% of the canvas, which caps the artwork at roughly 56%.
const TARGETS = [
  { file: 'apple-touch-icon.png', size: 180, padding: 0.12 },
  { file: 'icon-192.png', size: 192, padding: 0.12 },
  { file: 'icon-512.png', size: 512, padding: 0.12 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.22 },
  { file: 'icon-1024.png', size: 1024, padding: 0.12 }
];

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { svg: null, out: [], background: '#ffffff', ink: '#172033' };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!flag.startsWith('--')) {
      fail(`unexpected argument: ${flag}`);
    }
    if (value === undefined || value.startsWith('--')) {
      fail(`missing value for ${flag}`);
    }

    switch (flag) {
      case '--svg':
        options.svg = value;
        break;
      case '--out':
        options.out.push(value);
        break;
      case '--background':
        options.background = value;
        break;
      case '--ink':
        options.ink = value;
        break;
      default:
        fail(`unknown flag: ${flag}`);
    }

    index += 1;
  }

  if (!options.svg) {
    fail('--svg is required');
  }
  if (options.out.length === 0) {
    fail('--out is required at least once');
  }

  return options;
}

/**
 * Normalize the root <svg> tag so the artwork scales to the wrapper box. Brand
 * SVGs often set an intrinsic width/height that would otherwise win over CSS.
 */
function normalizeSvg(source, svgPath) {
  const rootTag = /<svg\b[^>]*>/;
  if (!rootTag.test(source)) {
    fail(`no <svg> root element found in ${svgPath}`);
  }

  return source.replace(rootTag, tag =>
    tag
      .replace(/\s(width|height|style|class)="[^"]*"/g, '')
      .replace('<svg', '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"')
  );
}

function buildHtml(svg, { background, ink, inner }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: ${background};
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${ink};
      }
      .mark {
        width: ${inner}px;
        height: ${inner}px;
      }
      .mark svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div class="mark">${svg}</div>
  </body>
</html>`;
}

const options = parseArgs(process.argv.slice(2));
const svgPath = resolve(rootDir, options.svg);
const svg = normalizeSvg(readFileSync(svgPath, 'utf8'), svgPath);

// @playwright/test is a frontend workspace dependency, so resolve it from there.
const requireFromFrontend = createRequire(resolve(rootDir, 'frontend/package.json'));
const { chromium } = requireFromFrontend('@playwright/test');

for (const outputDir of options.out) {
  mkdirSync(resolve(rootDir, outputDir), { recursive: true });
}

const browser = await chromium.launch();
const rendered = [];

try {
  for (const target of TARGETS) {
    const inner = Math.round(target.size * (1 - target.padding * 2));
    const page = await browser.newPage({
      viewport: { width: target.size, height: target.size },
      deviceScaleFactor: 1
    });

    try {
      await page.setContent(
        buildHtml(svg, { background: options.background, ink: options.ink, inner }),
        { waitUntil: 'load' }
      );

      const png = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: target.size, height: target.size }
      });

      for (const outputDir of options.out) {
        const outputPath = resolve(rootDir, outputDir, target.file);
        writeFileSync(outputPath, png);
        rendered.push({ path: outputPath, size: target.size, bytes: png.length });
      }
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`source: ${svgPath}`);
console.log(`background: ${options.background}  ink: ${options.ink}`);
for (const item of rendered) {
  const kb = (statSync(item.path).size / 1024).toFixed(1);
  console.log(`  ${item.size}x${item.size}  ${kb} KiB  ${item.path}`);
}
