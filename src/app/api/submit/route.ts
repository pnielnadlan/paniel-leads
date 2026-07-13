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
import { insertLead, markLeadSynced, markLeadFailed } from '@/lib/leads-db';
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
  /** V1 עדיין שולח fullName יחיד — נחלוץ ל-first/last בשרת. */
  fullName?: string;
  firstName?: string;
  lastName?: string;
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
  /** שם פרטי — נאסף בשלב נפרד ומועבר ישירות ל-Smoove ללא פיצול. */
  firstName: string;
  /** שם משפחה — נאסף בשלב נפרד. אם המשתמש מזין שם פרטי בלבד, זה עלול
   *  להיות ריק — נטפל ב-fallback בהמשך. */
  lastName: string;
  phone: string;
  /** ל-backward compat: אם client ישן שולח fullName במקום firstName/lastName. */
  fullName?: string;
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
  // תמיכה בשני פורמטים:
  //   חדש: firstName + lastName (V2 chatbot after split)
  //   ישן: fullName (V1 form, או clients שעוד לא רוננו)
  const hasNewName =
    'firstName' in body && typeof body.firstName === 'string' && body.firstName.trim().length >= 2;
  const hasOldName =
    'fullName' in body && typeof body.fullName === 'string' && body.fullName.trim().length >= 2;
  if (!hasNewName && !hasOldName) {
    return NextResponse.json({ error: 'שם נדרש' }, { status: 400 });
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

  // חילוץ שם — תמיכה בשני פורמטים.
  const { firstName, lastName, fullName } = resolveNames(body);

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
    fullName,
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

  // Safety net: שומרים את הליד ב-Supabase לפני שמנסים Smoove.
  // גם אם הסנכרון נופל — יש לנו את הליד מקומית ונוכל לסנכרן בדיעבד.
  const leadId = await insertLead({
    questionnaire_id: 'q1',
    email: body.email,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    phone: body.phone,
    wants_meeting: body.wantsMeeting,
    answers: body.answers as unknown as Record<string, string>,
    report_id: scoring.reportId,
    report_url: reportUrl,
    capital_range: scoring.capitalRange,
    has_existing_property: scoring.hasExistingProperty,
  });

  try {
    await syncContactToSmoove({
      questionnaireId: 'q1',
      email: body.email,
      firstName,
      lastName,
      phone: body.phone,
      capitalRange: scoring.capitalRange,
      hasExistingProperty: scoring.hasExistingProperty,
      reportUrl,
      wantsMeeting: body.wantsMeeting,
      marketingConsent: body.marketingConsent ?? true,
    });
    if (leadId) await markLeadSynced(leadId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[submit:q1] Smoove sync failed:', msg);
    if (leadId) await markLeadFailed(leadId, msg);
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

  // חילוץ שם — תמיכה בשני פורמטים (חדש: firstName+lastName / ישן: fullName).
  const { firstName, lastName, fullName } = resolveNames(body);

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
    fullName,
    firstName,
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

  // Safety net: שומרים את הליד ב-Supabase לפני שמנסים Smoove.
  const leadId = await insertLead({
    questionnaire_id: 'q2',
    audience: body.audience,
    email: body.email,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    phone: body.phone,
    wants_meeting: body.wantsMeeting,
    answers: body.answers as unknown as Record<string, string>,
    report_id: scoring.selectedReport,
    report_url: reportUrl,
    capital_range: scoring.capitalRange,
    has_existing_property: scoring.hasExistingProperty,
  });

  try {
    await syncContactToSmoove({
      questionnaireId: 'q2',
      email: body.email,
      firstName,
      lastName,
      phone: body.phone,
      capitalRange: scoring.capitalRange,
      hasExistingProperty: scoring.hasExistingProperty,
      reportUrl,
      wantsMeeting: body.wantsMeeting,
      marketingConsent: true,
    });
    if (leadId) await markLeadSynced(leadId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[submit:q2] Smoove sync failed:', msg);
    if (leadId) await markLeadFailed(leadId, msg);
  }

  return NextResponse.json({
    ok: true,
    reportId: scoring.selectedReport,
    reportUrl,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// עזרים
// ────────────────────────────────────────────────────────────────────────────

/**
 * מחלץ שם פרטי + שם משפחה + שם מלא מה-payload, תומך בשני פורמטים:
 *   חדש: firstName + lastName (V2 chatbot אחרי הפיצול)
 *   ישן: fullName יחיד (V1 form או clients ישנים)
 *
 * לעולם לא מחזיר lastName ריק — אם המשתמש מזין שם פרטי בלבד,
 * lastName נופל חזרה ל-firstName (למנוע שבירת אוטומציות בסמוב שמפנות
 * ל-{{lastName}}).
 */
function resolveNames(body: {
  firstName?: string;
  lastName?: string;
  fullName?: string;
}): { firstName: string; lastName: string; fullName: string } {
  const first = (body.firstName ?? '').trim();
  const last = (body.lastName ?? '').trim();
  if (first) {
    // פורמט חדש (יש לפחות שם פרטי)
    const lastNameOut = last || first;
    return {
      firstName: first,
      lastName: lastNameOut,
      fullName: last ? `${first} ${last}` : first,
    };
  }
  // פורמט ישן — מפצלים את fullName לפי הרווח הראשון
  const trimmed = (body.fullName ?? '').trim();
  const spaceIdx = trimmed.indexOf(' ');
  const firstFromFull = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const lastFromFull = spaceIdx === -1 ? trimmed : trimmed.slice(spaceIdx + 1);
  return {
    firstName: firstFromFull,
    lastName: lastFromFull || firstFromFull,
    fullName: trimmed,
  };
}
