// סקריפט בדיקה: מייצר PDF מדגמי לדוח 3.4 (מתכנני היציאה, פוקוס סוג עסקה)
// ושומר אותו ב-tmp/sample.pdf.
//
// הרצה: node --experimental-strip-types --no-warnings scripts/sample-pdf.ts

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTemplate } from '../src/lib/render-template.ts';
import { buildPdfHtml } from '../src/lib/pdf-html.ts';
import { generatePdf } from '../src/lib/pdf-generator.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'tmp');
mkdirSync(OUT_DIR, { recursive: true });

const SAMPLE = {
  reportId: '3.4',
  fullName: 'ישראל ישראלי',
  capitalRange: '500k_1m' as const,
  hasExistingProperty: true,
};

console.log('Rendering template...');
const rendered = renderTemplate(SAMPLE);
console.log(`  → title: ${rendered.title}`);
console.log(`  → profile: ${rendered.profileName}`);
console.log(`  → focus: ${rendered.focus} (${rendered.focusName.split(' - ')[0]})`);
console.log(`  → teasers: ${rendered.teasers.length}`);

console.log('\nBuilding HTML...');
const html = buildPdfHtml(rendered);
const htmlPath = join(OUT_DIR, 'sample.html');
writeFileSync(htmlPath, html, 'utf-8');
console.log(`  → ${htmlPath} (${html.length.toLocaleString()} chars)`);

console.log('\nGenerating PDF (Puppeteer)...');
const start = Date.now();
const pdf = await generatePdf(html);
const elapsed = Date.now() - start;
const pdfPath = join(OUT_DIR, 'sample.pdf');
writeFileSync(pdfPath, pdf);
console.log(`  → ${pdfPath} (${(pdf.length / 1024).toFixed(1)} KB, ${elapsed}ms)`);

console.log('\nDone.');
