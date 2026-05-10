// V2 (q2) — בונה HTML של דוח PDF.
// אותו סגנון ויזואלי כמו V1 (לוגו, פונט אלמוני, פלטה).
// אין meta-strip עם "קטגוריית הדוח" — זה תיוג פנימי שלא מתאים ללקוח.
// בסוף יש סקציית CTA בולטת עם כפתור קליקבילי לתיאום פגישה.

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

const CONSULTING_URL = 'https://pniel.co.il/consulting/';

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
      margin: 0 0 8mm 0;
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

    main > p { margin-bottom: 3mm; }

    /* ─── סקציית CTA — בולטת, ממורכזת, עם כפתור קליקבילי ─── */
    .meeting-cta {
      margin-top: 14mm;
      padding: 10mm 8mm 11mm;
      background: ${COLORS.paleBackground};
      border-radius: 5mm;
      border: 2px solid ${COLORS.dodgerBlue};
      page-break-inside: avoid;
      text-align: center;
    }

    .meeting-cta .cta-label {
      font-weight: 700;
      font-size: 14pt;
      color: ${COLORS.dodgerBlue};
      margin: 0 0 4mm 0;
      letter-spacing: 0.02em;
    }

    .meeting-cta .cta-text {
      font-size: 14pt;
      line-height: 1.65;
      color: ${COLORS.prussianBlue};
      font-weight: 500;
      margin: 0 auto 8mm;
      max-width: 145mm;
      text-align: center;
    }

    .meeting-cta .cta-headline {
      font-weight: 800;
      font-size: 22pt;
      color: ${COLORS.prussianBlue};
      margin: 0 0 6mm 0;
      line-height: 1.2;
      letter-spacing: -0.01em;
    }

    /* כפתור CTA — אנקור עם רקע מלא, גרדיאנט בלוז המותג, ללא קו תחתון */
    .meeting-cta .cta-button {
      display: inline-block;
      padding: 5mm 12mm;
      background: ${COLORS.dodgerBlue};
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 15pt;
      border-radius: 3mm;
      letter-spacing: 0.01em;
      box-shadow: 0 2mm 4mm rgba(0, 153, 255, 0.25);
    }

    .meeting-cta .cta-button:visited,
    .meeting-cta .cta-button:link {
      color: #ffffff !important;
      text-decoration: none;
    }
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

  <main>
    ${report.bodyHtml}
  </main>

  <div class="meeting-cta">
    <div class="cta-label">השלב הבא: שיחת פיצוח אישית</div>
    <p class="cta-text">בפניאל נדל״ן ליווינו מעל 500 משפחות לרכישת נכס מבטיח, ויותר מ-80 כבר מימשו אקזיט ברווח נאה. שיחה אישית קצרה תאפשר לבדוק יחד איך הנתונים, ההון והמטרות שלכם מתחברים לתוכנית מעשית.</p>
    <h2 class="cta-headline">מוכנים להשקיע בעתיד שלכם?</h2>
    <a class="cta-button" href="${CONSULTING_URL}">קבעו פגישת אפיון ללא עלות &raquo;&raquo;</a>
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
