// V2 (q2) — בונה HTML של דוח PDF.
// אותו סגנון ויזואלי כמו V1 (לוגו, פונט אלמוני, פלטה), אבל מבנה מטא פשוט יותר —
// אין "פרופיל" ו"פוקוס", רק קטגוריית הדוח.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Q2RenderOutput } from './render-q2.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

function loadAsBase64(relativePath: string): string {
  return readFileSync(join(PUBLIC_DIR, relativePath)).toString('base64');
}

function loadAsText(relativePath: string): string {
  return readFileSync(join(PUBLIC_DIR, relativePath), 'utf-8');
}

const FONT_REGULAR = loadAsBase64('fonts/almoni-regular.woff2');
const FONT_MEDIUM = loadAsBase64('fonts/almoni-medium.woff2');
const FONT_BOLD = loadAsBase64('fonts/almoni-bold.woff2');
const LOGO_SVG = loadAsText('branding/logo.svg');

const COLORS = {
  prussianBlue: '#011d30',
  balticBlue: '#006699',
  strongCyan: '#00cccc',
  dodgerBlue: '#0099ff',
  paleBackground: '#f5fafd',
  border: '#e0e8ef',
};

export function buildQ2PdfHtml(report: Q2RenderOutput): string {
  const css = `
    @font-face {
      font-family: 'Almoni';
      src: url(data:font/woff2;base64,${FONT_REGULAR}) format('woff2');
      font-weight: 400; font-style: normal;
    }
    @font-face {
      font-family: 'Almoni';
      src: url(data:font/woff2;base64,${FONT_MEDIUM}) format('woff2');
      font-weight: 500; font-style: normal;
    }
    @font-face {
      font-family: 'Almoni';
      src: url(data:font/woff2;base64,${FONT_BOLD}) format('woff2');
      font-weight: 700; font-style: normal;
    }

    @page {
      size: A4;
      margin: 18mm 16mm 22mm 16mm;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Almoni', 'Helvetica', Arial, sans-serif;
      color: ${COLORS.prussianBlue};
      direction: rtl;
      font-size: 13pt;
      line-height: 1.7;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    header.brand-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10mm;
      border-bottom: 1px solid ${COLORS.border};
      margin-bottom: 8mm;
    }

    header .logo { height: 18mm; width: auto; }

    header .badge {
      font-weight: 500;
      font-size: 10pt;
      color: ${COLORS.balticBlue};
      letter-spacing: 0.05em;
    }

    .supratitle {
      color: ${COLORS.balticBlue};
      font-weight: 500;
      font-size: 13pt;
      letter-spacing: 0.02em;
      margin: 0 0 2mm 0;
    }

    h1.report-title {
      color: ${COLORS.prussianBlue};
      font-weight: 700;
      font-size: 26pt;
      line-height: 1.25;
      margin: 0 0 6mm 0;
    }

    .meta-strip {
      display: flex;
      gap: 6mm;
      padding: 3mm 4mm;
      background: ${COLORS.paleBackground};
      border-right: 3px solid ${COLORS.strongCyan};
      margin-bottom: 8mm;
      font-size: 10pt;
    }

    .meta-strip .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-strip .meta-label {
      color: ${COLORS.balticBlue};
      font-weight: 500;
      font-size: 8.5pt;
      letter-spacing: 0.04em;
    }

    .meta-strip .meta-value {
      color: ${COLORS.prussianBlue};
      font-weight: 700;
      font-size: 11pt;
    }

    main h2 {
      color: ${COLORS.balticBlue};
      font-weight: 700;
      font-size: 16pt;
      margin: 9mm 0 3mm 0;
      padding-right: 4mm;
      border-right: 3px solid ${COLORS.strongCyan};
      page-break-after: avoid;
    }

    main p {
      margin: 0 0 3mm 0;
      text-align: justify;
    }

    main p:last-child {
      margin-bottom: 0;
    }

    .meeting-cta {
      margin-top: 10mm;
      padding: 6mm 6mm;
      background: ${COLORS.paleBackground};
      border-radius: 4mm;
      border: 1.5px solid ${COLORS.dodgerBlue};
      page-break-inside: avoid;
    }

    .meeting-cta .cta-label {
      font-weight: 700;
      font-size: 11pt;
      color: ${COLORS.dodgerBlue};
      margin-bottom: 2mm;
      letter-spacing: 0.02em;
    }

    .meeting-cta .cta-text {
      font-size: 12pt;
      line-height: 1.6;
      color: ${COLORS.prussianBlue};
      margin: 0;
    }

    main > p { margin-bottom: 3mm; }
  `;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(report.title)}</title>
  <style>${css}</style>
</head>
<body>
  <header class="brand-bar">
    <div class="logo-wrap">${LOGO_SVG.replace(/<svg/, '<svg class="logo"')}</div>
    <div class="badge">דוח אישי - סימולטור משקיע</div>
  </header>

  <div class="supratitle">דוח אישי עבור ${escapeHtml(report.fullName)}</div>
  <h1 class="report-title">${escapeHtml(report.title)}</h1>

  <div class="meta-strip">
    <div class="meta-item">
      <span class="meta-label">קטגוריית הדוח</span>
      <span class="meta-value">${escapeHtml(report.subtitle)}</span>
    </div>
  </div>

  <main>
    ${report.bodyHtml}
  </main>

  <div class="meeting-cta">
    <div class="cta-label">השלב הבא: שיחת פיצוח אישית</div>
    <p class="cta-text">בפניאל נדל״ן ליווינו מעל 500 משפחות לרכישת נכס מבטיח, ויותר מ-80 כבר מימשו אקזיט ברווח נאה. שיחה אישית קצרה תאפשר לבדוק יחד איך הנתונים, ההון והמטרות שלכם מתחברים לתוכנית מעשית.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
