// בונה מסמך HTML מלא לרינדור ב-Puppeteer.
// מטפלל את גוף הדוח (HTML שכבר נוצר מ-markdown) במבנה עם:
//   - header עם לוגו פניאל בראש כל עמוד
//   - footer עם מספר עמוד + ברנדינג
//   - גופן Almoni embedded כ-base64 (כך שהמסמך self-contained ועובד גם ב-Vercel)
//   - פלטת צבעים מהמותג (Prussian Blue, Baltic Blue, Strong Cyan, Dodger Blue)
//   - layout RTL בעברית

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RenderOutput } from './render-template.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

function loadAsBase64(relativePath: string): string {
  const buf = readFileSync(join(PUBLIC_DIR, relativePath));
  return buf.toString('base64');
}

function loadAsText(relativePath: string): string {
  return readFileSync(join(PUBLIC_DIR, relativePath), 'utf-8');
}

const FONT_REGULAR = loadAsBase64('fonts/almoni-regular.woff2');
const FONT_MEDIUM = loadAsBase64('fonts/almoni-medium.woff2');
const FONT_BOLD = loadAsBase64('fonts/almoni-bold.woff2');
const LOGO_SVG = loadAsText('branding/logo.svg');

const COLORS = {
  prussianBlue: '#011d30', // טקסט גוף, כותרת ראשית
  balticBlue: '#006699',   // כותרות סקציה
  strongCyan: '#00cccc',   // accent — פס שמאלי, מסגרות
  dodgerBlue: '#0099ff',   // CTA / כפתור פגישה
  paleBackground: '#f5fafd', // רקע קופסת CTA
  border: '#e0e8ef',
};

export function buildPdfHtml(report: RenderOutput): string {
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

    header .logo {
      height: 18mm;
      width: auto;
    }

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

    p.greeting {
      font-weight: 500;
      font-size: 13pt;
      color: ${COLORS.balticBlue};
      margin: 0 0 4mm 0;
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

    main {
      /* תוכן הדוח */
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
      margin-top: 12mm;
      padding: 10mm 8mm 11mm;
      background: ${COLORS.paleBackground};
      border-radius: 5mm;
      border: 2px solid ${COLORS.dodgerBlue};
      page-break-inside: avoid;
      text-align: center;
    }

    .meeting-cta .cta-label {
      font-weight: 800;
      font-size: 16pt;
      color: ${COLORS.dodgerBlue};
      margin: 0 0 5mm 0;
      letter-spacing: 0.02em;
    }

    .meeting-cta .cta-text {
      font-size: 13pt;
      line-height: 1.65;
      color: ${COLORS.prussianBlue};
      font-weight: 500;
      margin: 0 auto 8mm;
      max-width: 145mm;
      text-align: center;
    }

    /* כפתור CTA קליקבילי — אנקור עם href ל-pniel.co.il/consulting/ */
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

    /* עיצוב חלקי הטקסט הראשון (לפני הכותרת הראשונה) — פסקאות פתיחה */
    main > p {
      margin-bottom: 3mm;
    }
  `;

  // הצגה של "שם פרטי" — ה-renderer החליף [[שם פרטי]] בתוך הטקסט,
  // אבל אנחנו רוצים berate ברכה בולטת בנפרד. נשלוף את הברכה הראשונה (שם בתחילת
  // הפסקה הראשונה) — או פשוט נכתוב "שלום [שם]" כברכה לפני הכותרת.
  // הטקסט המלא של הפסקה הראשונה כבר כולל [[שם פרטי]] שהוחלף.

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
    <div class="badge">דוח פרופיל משקיע</div>
  </header>

  <div class="supratitle">דוח פרופיל משקיע אישי עבור ${escapeHtml(report.fullName)}</div>
  <h1 class="report-title">${escapeHtml(report.title)}</h1>

  <div class="meta-strip">
    <div class="meta-item">
      <span class="meta-label">פרופיל משקיע</span>
      <span class="meta-value">${escapeHtml(report.profileName)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">פוקוס הדוח</span>
      <span class="meta-value">${escapeHtml(report.focusName.split(' - ')[0])}</span>
    </div>
  </div>

  <main>
    ${report.bodyHtml}
  </main>

  <div class="meeting-cta">
    <div class="cta-label">השלב הבא: פגישת אפיון אישית</div>
    <p class="cta-text">${escapeHtml(report.meetingSentence)}</p>
    <a class="cta-button" href="https://pniel.co.il/consulting/">קבעו פגישת אפיון ללא עלות &raquo;&raquo;</a>
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
