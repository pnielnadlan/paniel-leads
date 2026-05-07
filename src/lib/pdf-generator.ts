// PDF generator — מקבל מחרוזת HTML ומחזיר Buffer של PDF.
//
// משתמש ב-puppeteer-core בלבד (חבילה קלה, ללא Chromium מובנה):
//   - מקומי: מתחבר ל-Chrome המותקן במק (path סטנדרטי, אפשר לדרוס ב-CHROME_PATH)
//   - Vercel/Lambda: מתחבר ל-Chromium מ-@sparticuz/chromium

import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';

export type PdfOptions = {
  /** Footer text — מופיע במרכז הפוטר (ברירת מחדל: "פניאל נדל\"ן"). */
  footerText?: string;
};

const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    // ─── סביבת Vercel/Lambda ─────────────────────────────────────────
    const { default: chromium } = await import('@sparticuz/chromium');
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // ─── סביבה מקומית — Chrome שמותקן על המכונה ────────────────────────
  return puppeteer.launch({
    executablePath: findLocalChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

function findLocalChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  // נתיבי ברירת מחדל לבחינה — מק/לינוקס/Win
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/עותק של Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new Error(
    'לא נמצא Chrome בנתיב סטנדרטי. הגדר CHROME_PATH ב-env למיקום הבינארי.',
  );
}

export async function generatePdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const footerText = options.footerText ?? 'פניאל נדל"ן';
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const footerTemplate = `
      <div style="
        font-family: Helvetica, Arial, sans-serif;
        font-size: 8.5pt;
        color: #006699;
        width: 100%;
        text-align: center;
        padding: 0 16mm;
        direction: rtl;
      ">
        <span>${escapeHtml(footerText)}</span>
        <span style="margin-right: 6mm;">·</span>
        <span>עמ' <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span>
      </div>
    `;

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate,
      margin: { top: '18mm', right: '16mm', bottom: '22mm', left: '16mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
