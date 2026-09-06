import { createRequire } from 'node:module';
import { URL } from 'node:url';
import fs from 'node:fs/promises';

const require = createRequire('/Users/kai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');

const outputDir = new URL('../outputs/brand-vi-flova-lovart-study/references/', import.meta.url);
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

for (const [name, url] of [
  ['flova-homepage.png', 'https://www.flova.ai/'],
  ['lovart-homepage.png', 'https://www.lovart.ai/'],
]) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: new URL(name, outputDir), fullPage: false });
}

await browser.close();
