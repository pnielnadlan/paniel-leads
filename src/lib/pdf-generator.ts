// PDF generator — מקבל מחרוזת HTML ומחזיר Buffer של PDF.
//
// תאימות לשני סביבות:
//   - מקומי (dev): משתמש ב-puppeteer המלא (Chrome bundled)
//   - Vercel/Lambda: משתמש ב-puppeteer-core + @sparticuz/chromium
// הזיהוי לפי משתנה הסביבה VERCEL (מוגדר אוטומטית ב-Vercel).

import type { Browser } from 'puppeteer-core';

export type PdfOptions = {
  /** Footer text — מופיע במרכז הפוטר (ברירת מחדל: "פניאל נדל\"ן"). */
  footerText?: string;
};

const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    // ─── סביבת Vercel/Lambda ─────────────────────────────────────────
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
      import('@sparticuz/chromium'),
      import('puppeteer-core'),
    ]);
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    }) as unknown as Browser;
  } else {
    // ─── סביבה מקומית — puppeteer המלא ────────────────────────────────
    // dynamic import כדי שhe-bundler של Vercel לא ינסה להכניס puppeteer ל-Lambda
    const { default: puppeteer } = await import('puppeteer');
    return puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }) as unknown as Browser;
  }
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
