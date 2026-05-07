// מצלם screenshot של ה-HTML של דוח לדוגמה — לבדיקה ויזואלית של העיצוב.
// הרצה: node --experimental-strip-types --no-warnings scripts/sample-screenshot.ts

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME_PATH =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'tmp');
mkdirSync(OUT_DIR, { recursive: true });

const html = readFileSync(join(OUT_DIR, 'sample.html'), 'utf-8');

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
// A4 ב-96 dpi: 794 × 1123 px לעמוד
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.screenshot({
  path: join(OUT_DIR, 'sample-screenshot.png'),
  fullPage: true,
});
await browser.close();
console.log(`Screenshot: ${join(OUT_DIR, 'sample-screenshot.png')}`);
