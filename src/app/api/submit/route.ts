// POST /api/submit
// מקבל הגשת שאלון (V1 או V2), מבצע ניקוד צד-שרת, מייצר PDF, מעלה לאחסון, ושולח ל-Smoove.
//
// V1 (q1) — שאלון "מסכים" של 13 שאלות, 25 דוחות (פרופיל × פוקוס).
// V2 (q2) — שאלון "צ'אטבוט" של 13 שאלות מוערכות, 6 דוחות (R1-R6).

import { NextResponse } from 'next/server';
import { scoreSubmission, type Answers } from '@/lib/scoring';
import { renderTemplate } from '@/lib/render-template';
import { buildPdfHtml } from '@/lib/pdf-html';
import { generatePdf } from '@/lib/pdf-generator';
import { uploadReportPdf } from '@/lib/supabase';
import { syncContactToSmoove } from '@/lib/smoove';
import { type OptionId } from '@/data/questions';
import { scoreQ2Submission, type Q2Answers } from '@/lib/scoring-q2';
import { renderQ2Report } from '@/lib/render-q2';
import { buildQ2PdfHtml } from '@/lib/pdf-html-q2';
import type { OptionId as Q2OptionId, AudienceVariant } from '@/data/questions-q2';

export const maxDuration = 60;
export const runtime = 'nodejs';

type V1Payload = {
  questionnaireId?: 'q1';
  answers: Record<string, OptionId>;
  email: string;
  fullName: string;
  phone?: string;
  wantsMeeting: boolean;
  wantsReport: boolean;
  marketingConsent: boolean;
};

type V2Payload = {
  questionnaireId: 'q2';
  audience: AudienceVariant;
  answers: Record<string, Q2OptionId>;
  email: string;
  fullName: string;
  phone: string;
  /** המשתמש בחר באופציה "+ שיחת פיצוח" בסוף השאלון (במקום "רק דוח"). */
  wantsMeeting: boolean;
};

type SubmitPayload = V1Payload | V2Payload;

type SubmitResult = {
  ok: true;
  reportId: string;
  reportUrl: string;
};

export async function POST(
  request: Request,
): Promise<NextResponse<SubmitResult | { error: string }>> {
  let body: SubmitPayload;
  try {
    body = (await request.json()) as SubmitPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ─── ולידציה משותפת ─────────────────────────────────────────────────────
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'מייל לא תקין' }, { status: 400 });
  }
  if (!body.fullName || body.fullName.trim().length < 2) {
    return NextResponse.json({ error: 'שם מלא נדרש' }, { status: 400 });
  }
  if (!body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ error: 'תשובות חסרות' }, { status: 400 });
  }

  if (body.questionnaireId === 'q2') {
    return handleV2(body);
  }
  return handleV1(body);
}

// ────────────────────────────────────────────────────────────────────────────
// V1 (q1) — flow קיים
// ────────────────────────────────────────────────────────────────────────────

async function handleV1(body: V1Payload): Promise<NextResponse<SubmitResult | { error: string }>> {
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

  const rendered = renderTemplate({
    reportId: scoring.reportId,
    fullName: body.fullName.trim(),
    capitalRange: scoring.capitalRange,
    hasExistingProperty: scoring.hasExistingProperty,
  });

  let pdfBuffer: Buffer;
  try {
    const html = buildPdfHtml(rendered);
    pdfBuffer = await generatePdf(html);
  } catch (err) {
    console.error('[submit:q1] PDF generation failed:', err);
    return NextResponse.json({ error: 'יצירת ה-PDF נכשלה' }, { status: 500 });
  }

  let reportUrl: string;
  try {
    reportUrl = await uploadReportPdf({
      pdf: pdfBuffer,
      reportId: `q1-${scoring.reportId}`,
      email: body.email,
    });
  } catch (err) {
    console.error('[submit:q1] PDF upload failed:', err);
    return NextResponse.json({ error: 'העלאת הדוח נכשלה' }, { status: 500 });
  }

  try {
    await syncContactToSmoove({
      questionnaireId: 'q1',
      email: body.email,
      fullName: body.fullName.trim(),
      phone: body.phone,
      capitalRange: scoring.capitalRange,
      hasExistingProperty: scoring.hasExistingProperty,
      reportUrl,
      wantsMeeting: body.wantsMeeting,
      marketingConsent: body.marketingConsent ?? true,
    });
  } catch (err) {
    console.error('[submit:q1] Smoove sync failed:', err);
  }

  return NextResponse.json({
    ok: true,
    reportId: scoring.reportId,
    reportUrl,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// V2 (q2) — flow חדש
// ────────────────────────────────────────────────────────────────────────────

async function handleV2(body: V2Payload): Promise<NextResponse<SubmitResult | { error: string }>> {
  const answers: Q2Answers = new Map();
  for (const [k, v] of Object.entries(body.answers)) {
    answers.set(k, v);
  }

  let scoring;
  try {
    scoring = scoreQ2Submission(answers);
  } catch (err) {
    return NextResponse.json(
      { error: `שגיאת ניקוד: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 400 },
    );
  }

  const rendered = renderQ2Report({
    reportId: scoring.selectedReport,
    fullName: body.fullName.trim(),
  });

  let pdfBuffer: Buffer;
  try {
    const html = buildQ2PdfHtml(rendered);
    pdfBuffer = await generatePdf(html);
  } catch (err) {
    console.error('[submit:q2] PDF generation failed:', err);
    return NextResponse.json({ error: 'יצירת ה-PDF נכשלה' }, { status: 500 });
  }

  let reportUrl: string;
  try {
    reportUrl = await uploadReportPdf({
      pdf: pdfBuffer,
      reportId: `q2-${scoring.selectedReport}`,
      email: body.email,
    });
  } catch (err) {
    console.error('[submit:q2] PDF upload failed:', err);
    return NextResponse.json({ error: 'העלאת הדוח נכשלה' }, { status: 500 });
  }

  try {
    await syncContactToSmoove({
      questionnaireId: 'q2',
      email: body.email,
      fullName: body.fullName.trim(),
      phone: body.phone,
      capitalRange: scoring.capitalRange,
      reportUrl,
      // המשתמש בחר אם הוא רוצה גם שיחת פיצוח (→ list 968406) או רק דוח.
      wantsMeeting: body.wantsMeeting,
      marketingConsent: true,
    });
  } catch (err) {
    console.error('[submit:q2] Smoove sync failed:', err);
  }

  return NextResponse.json({
    ok: true,
    reportId: scoring.selectedReport,
    reportUrl,
  });
}
