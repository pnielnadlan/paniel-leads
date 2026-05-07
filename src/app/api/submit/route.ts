// POST /api/submit
// מקבל את הגשת השאלון, מבצע ניקוד צד-שרת, מייצר PDF, מעלה לאחסון, ושולח ל-Smoove.
//
// כרגע: Supabase ו-Smoove במצב STUB עד שהלקוח יספק credentials.
// כשיהיו — מחליפים את uploadPdfStub/sendToSmoveStub במימוש האמיתי.

import { NextResponse } from 'next/server';
import { scoreSubmission, type Answers } from '@/lib/scoring';
import { renderTemplate } from '@/lib/render-template';
import { buildPdfHtml } from '@/lib/pdf-html';
import { generatePdf } from '@/lib/pdf-generator';
import { uploadReportPdf } from '@/lib/supabase';
import { syncContactToSmoove } from '@/lib/smoove';
import { type OptionId } from '@/data/questions';

// משך מקסימלי — Puppeteer יכול לקחת כמה שניות במיוחד ב-cold start
export const maxDuration = 60;
// puppeteer דורש Node runtime (לא Edge)
export const runtime = 'nodejs';

type SubmitPayload = {
  answers: Record<string, OptionId>;
  email: string;
  fullName: string;
  phone?: string;
  wantsMeeting: boolean;
  wantsReport: boolean;
};

type SubmitResult = {
  ok: true;
  reportId: string;
  reportUrl: string;
};

export async function POST(request: Request): Promise<NextResponse<SubmitResult | { error: string }>> {
  let body: SubmitPayload;
  try {
    body = (await request.json()) as SubmitPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ─── ולידציה בסיסית ─────────────────────────────────────────────────────
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'מייל לא תקין' }, { status: 400 });
  }
  if (!body.fullName || body.fullName.trim().length < 2) {
    return NextResponse.json({ error: 'שם מלא נדרש' }, { status: 400 });
  }
  if (!body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ error: 'תשובות חסרות' }, { status: 400 });
  }

  // ─── המרה ל-Map וניקוד ─────────────────────────────────────────────────
  const answers: Answers = new Map();
  for (const [k, v] of Object.entries(body.answers)) {
    answers.set(Number(k), v);
  }

  let scoring;
  try {
    scoring = scoreSubmission(answers);
  } catch (err) {
    return NextResponse.json(
      { error: `שגיאת ניקוד: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 400 },
    );
  }

  // ─── רינדור הטמפלייט ───────────────────────────────────────────────────
  const rendered = renderTemplate({
    reportId: scoring.reportId,
    fullName: body.fullName.trim(),
    capitalRange: scoring.capitalRange,
    hasExistingProperty: scoring.hasExistingProperty,
  });

  // ─── ייצור PDF ────────────────────────────────────────────────────────
  let pdfBuffer: Buffer;
  try {
    const html = buildPdfHtml(rendered);
    pdfBuffer = await generatePdf(html);
  } catch (err) {
    console.error('[submit] PDF generation failed:', err);
    return NextResponse.json({ error: 'יצירת ה-PDF נכשלה' }, { status: 500 });
  }

  // ─── העלאה ל-Storage ────────────────────────────────────────────────────
  let reportUrl: string;
  try {
    reportUrl = await uploadReportPdf({
      pdf: pdfBuffer,
      reportId: scoring.reportId,
      email: body.email,
    });
  } catch (err) {
    console.error('[submit] PDF upload failed:', err);
    return NextResponse.json({ error: 'העלאת הדוח נכשלה' }, { status: 500 });
  }

  // ─── סנכרון Smoove ────────────────────────────────────────────────────
  try {
    await syncContactToSmoove({
      email: body.email,
      fullName: body.fullName.trim(),
      phone: body.phone,
      capitalRange: scoring.capitalRange,
      hasExistingProperty: scoring.hasExistingProperty,
      reportUrl,
      wantsMeeting: body.wantsMeeting,
    });
  } catch (err) {
    // Smoove נכשל — לוגים אבל לא חוסם את התגובה ללקוח
    console.error('[submit] Smoove sync failed:', err);
  }

  return NextResponse.json({
    ok: true,
    reportId: scoring.reportId,
    reportUrl,
  });
}
