// אינטגרציה עם Smoove REST API.
// תיעוד: https://rest.smoove.io/swagger/ui/index
//
// אם SMOOVE_API_KEY חסר — לוג בלבד (פיתוח). ב-prod חובה.

import {
  type CapitalRange,
  SMOOVE_CAPITAL_LABELS,
} from '@/data/questions';
import {
  type CapitalRange as Q2CapitalRange,
  Q2_SMOOVE_CAPITAL_LABELS,
} from '@/data/questions-q2';

const SMOOVE_API_BASE = 'https://rest.smoove.io/v1';
const API_KEY = process.env.SMOOVE_API_KEY;
const MEETING_LIST_ID = Number(process.env.SMOOVE_MEETING_LIST_ID ?? 968406);

// Keys של ה-Custom Fields ב-Smoove. ה-IDs הם בפורמט "iN" (לא רק המספר).
// אומתו דרך GET /v1/Account/ContactFields.
const FIELD_CAPITAL = 'i1';        // dropDownList — "הסכום הזמין להשקעה"
const FIELD_HAS_PROPERTY = 'i18';  // boolean — "האם יש דירה בבעלותכם?"
const FIELD_REPORT_URL = 'i19';    // text — "קישור לדוח"
const FIELD_QUESTIONNAIRE = 'i20'; // text — מזהה השאלון: q1 / q2

export const smooveConfigured = Boolean(API_KEY);

/** קלט אחיד לסנכרון — תומך גם ב-V1 וגם ב-V2.
 * V1: capitalRange (CapitalRange) + hasExistingProperty (boolean).
 * V2: capitalRange (Q2CapitalRange) — בלי hasExistingProperty.
 */
export type SmoveSyncInput = {
  questionnaireId: 'q1' | 'q2';
  email: string;
  fullName: string;
  phone?: string;
  /** טווח הון עצמי. הסוג זהה בין V1 ל-V2 — שניהם בעצם 5 ערכים זהים. */
  capitalRange?: CapitalRange | Q2CapitalRange;
  /** קיים רק ב-V1; ב-V2 מתעלמים. */
  hasExistingProperty?: boolean;
  reportUrl: string;
  /** האם המשתמש מבקש פגישה (V1: צ'קבוקס, V2: נגזר מתשובת ש' 13). */
  wantsMeeting: boolean;
  marketingConsent: boolean;
};

/**
 * מסנכרן ליד ל-Smoove: יוצר/מעדכן contact עם השדות הרלוונטיים,
 * ואם wantsMeeting — מוסיף לרשימה 968406.
 */
export async function syncContactToSmoove(input: SmoveSyncInput): Promise<void> {
  // פיצול השם המלא ל-firstName / lastName בצורה פשוטה (Smoove דורש)
  const trimmed = input.fullName.trim();
  const spaceIdx = trimmed.indexOf(' ');
  const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

  const customFields: Record<string, string | boolean> = {
    [FIELD_REPORT_URL]: input.reportUrl,
    [FIELD_QUESTIONNAIRE]: input.questionnaireId,
  };

  // i1 — capital range. ה-labels זהים בין V1 ל-V2 (אותם 5 ערכים), אבל מקור
  // ה-mapping שונה. לכן בודקים לפי questionnaireId.
  if (input.capitalRange) {
    const label =
      input.questionnaireId === 'q2'
        ? Q2_SMOOVE_CAPITAL_LABELS[input.capitalRange as Q2CapitalRange]
        : SMOOVE_CAPITAL_LABELS[input.capitalRange as CapitalRange];
    customFields[FIELD_CAPITAL] = label;
  }

  // i18 — has property (V1 בלבד; ב-V2 לא נשלח כי השדה לא נאסף)
  if (input.questionnaireId === 'q1' && input.hasExistingProperty !== undefined) {
    customFields[FIELD_HAS_PROPERTY] = input.hasExistingProperty;
  }

  // נורמליזציה של מס' טלפון: נקה רווחים/מקפים, השאר רק ספרות + +
  const cleanPhone = input.phone?.replace(/[^\d+]/g, '') || undefined;

  const body: Record<string, unknown> = {
    email: input.email,
    firstName,
    lastName,
    customFields,
    lists_ToSubscribe: input.wantsMeeting ? [MEETING_LIST_ID] : [],
    canReceiveEmails: input.marketingConsent,
  };
  if (cleanPhone) {
    body.mobile = cleanPhone;
  }

  if (!API_KEY) {
    console.warn('[smoove] Not configured — would have sent:', body);
    return;
  }

  const url = `${SMOOVE_API_BASE}/Contacts?updateIfExists=true&restoreIfUnsubscribed=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Smoove API ${res.status}: ${text || res.statusText}`);
  }
}
